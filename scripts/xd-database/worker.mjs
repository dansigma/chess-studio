// scripts/xd-database/worker.mjs
// SIG-1449: worker thread of the database build (build.mjs).
//
// Phase 1 ("games"): replays the first `maxPly` moves of each game with chess.js
// and writes one 24-byte record per position the game reached (each position
// once per game) into a bucket file chosen by the top bits of the position key:
//
//   u32 key lo, u32 key hi, u32 game id, u16 move code (0: no move recorded
//   here: the game ended or reached maxPly), u8 result (0 white, 1 draw,
//   2 black), u8 ply, u16 white Elo, u16 black Elo, u16 year, u16 padding
//
// Phase 2 ("aggregate"): reads one bucket from every worker, sorts it by key,
// folds it into tree positions and writes tree pages and position-game postings to part files.
// Finalization fixes the global posting offsets and compresses the pages.
// Buckets cover disjoint, increasing key ranges, so concatenating the parts in
// bucket order gives a file sorted by key.
import { appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parentPort } from "node:worker_threads";
import { deflateRawSync } from "node:zlib";
import { Chess } from "chess.js";
import { encodeMove } from "../../src/chess/opening-book-format.ts";
import { ByteReader, ByteWriter, averageGameRating, readTreePosition, writeTreePosition } from "../../src/lib/xd-database/format.ts";
import { fenKey } from "../../src/chess/tree.ts";
import { indexCatalogOpenings } from "../../src/lib/line-opening.ts";
import { loadCatalog } from "../../src/lib/openings-catalog.ts";
import { positionKeyParts } from "./position-key.mjs";

const KEY_LO = 0;
const KEY_HI = KEY_LO + 4;
const GAME_ID = KEY_HI + 4;
const MOVE_CODE = GAME_ID + 4;
const RESULT = MOVE_CODE + 2;
const PLY = RESULT + 1;
const WHITE_ELO = PLY + 1;
const BLACK_ELO = WHITE_ELO + 2;
const YEAR = BLACK_ELO + 2;
export const RECORD_BYTES = YEAR + 4; // Pad to 4-byte alignment.
const FLUSH_BYTES = 1 << 18;

/** Bucket of a key: its top `bits` bits. */
export function bucketOf(hi, bits) {
  return bits === 0 ? 0 : hi >>> (32 - bits);
}

export function recordFile(tmpDir, bucket, worker) {
  return join(tmpDir, `rec-b${String(bucket).padStart(4, "0")}-w${String(worker).padStart(2, "0")}.bin`);
}

export function partFile(tmpDir, bucket) {
  return join(tmpDir, `tree-b${String(bucket).padStart(4, "0")}.part`);
}

export function positionPartFile(tmpDir, bucket) {
  return join(tmpDir, `position-games-b${String(bucket).padStart(4, "0")}.part`);
}

/** Phase 1 state: one pending buffer per bucket. */
export class RecordWriter {
  constructor({ tmpDir, worker, bucketBits }) {
    this.tmpDir = tmpDir;
    this.worker = worker;
    this.bucketBits = bucketBits;
    const buckets = 1 << bucketBits;
    this.buffers = Array.from({ length: buckets }, () => Buffer.alloc(FLUSH_BYTES));
    this.lengths = new Uint32Array(buckets);
    this.records = 0;
  }

  add(hi, lo, gameId, code, result, ply, whiteElo, blackElo, year) {
    const bucket = bucketOf(hi, this.bucketBits);
    let buffer = this.buffers[bucket];
    if (this.lengths[bucket] + RECORD_BYTES > buffer.length) {
      this.flush(bucket);
      buffer = this.buffers[bucket];
    }
    const at = this.lengths[bucket];
    buffer.writeUInt32LE(lo, at + KEY_LO);
    buffer.writeUInt32LE(hi, at + KEY_HI);
    buffer.writeUInt32LE(gameId, at + GAME_ID);
    buffer.writeUInt16LE(code, at + MOVE_CODE);
    buffer.writeUInt8(result, at + RESULT);
    buffer.writeUInt8(ply, at + PLY);
    buffer.writeUInt16LE(whiteElo, at + WHITE_ELO);
    buffer.writeUInt16LE(blackElo, at + BLACK_ELO);
    buffer.writeUInt16LE(year, at + YEAR);
    this.lengths[bucket] = at + RECORD_BYTES;
    this.records += 1;
  }

  flush(bucket) {
    const length = this.lengths[bucket];
    if (length > 0) {
      appendFileSync(recordFile(this.tmpDir, bucket, this.worker), this.buffers[bucket].subarray(0, length));
      this.lengths[bucket] = 0;
    }
  }

  flushAll() {
    for (let bucket = 0; bucket < this.buffers.length; bucket += 1) {
      this.flush(bucket);
    }
  }
}

/**
 * Memo of (position, SAN) -> (next FEN, move code). Openings repeat across
 * games, so most of the first plies skip chess.js entirely; chess.js is only
 * loaded (from the FEN) when a move is not in the memo. Cleared when full.
 */
export class MoveMemo {
  constructor(openings, limit = 1_000_000) {
    this.openings = openings;
    this.limit = limit;
    this.map = new Map();
    this.board = new Chess();
    this.boardFen = this.board.fen();
    this.startOpening = openings.get(fenKey(this.boardFen)) ?? -1;
    this.hits = 0;
    this.misses = 0;
  }

  /** { fen, code, opening } after playing `san` from `fen` (its key is `keyText`), or null when illegal. */
  play(fen, keyText, san) {
    const memoKey = `${keyText}|${san}`;
    const known = this.map.get(memoKey);
    if (known) {
      this.hits += 1;
      return known;
    }
    this.misses += 1;
    if (this.boardFen !== fen) {
      this.board.load(fen);
    }
    let move;
    try {
      move = this.board.move(san);
    } catch {
      move = null;
    }
    if (!move) {
      this.board.load(fen);
      this.boardFen = fen;
      return null;
    }
    this.boardFen = this.board.fen();
    const result = {
      fen: this.boardFen,
      code: encodeMove(move.from + move.to + (move.promotion ?? "")),
      opening: this.openings.get(fenKey(this.boardFen)),
    };
    if (this.map.size >= this.limit) {
      this.map.clear();
    }
    this.map.set(memoKey, result);
    return result;
  }
}

const START_FEN = new Chess().fen();
/** Replay the legal mainline for the opening, recording tree positions through maxPly. */
function replayInto(writer, game, maxPly, memo) {
  const seen = new Set();
  const key = [0, 0];
  let fen = START_FEN;
  let opening = memo.startOpening;
  for (let ply = 0; ; ply += 1) {
    const hasMove = ply < game.sans.length;
    const next = hasMove ? memo.play(fen, fen, game.sans[ply]) : null;
    if (ply <= maxPly) {
      positionKeyParts(fen, key);
      const keyText = `${key[0]}:${key[1]}`;
      if (!seen.has(keyText)) {
        seen.add(keyText);
        writer.add(key[0], key[1], game.id, ply < maxPly ? next?.code ?? 0 : 0,
          game.result, ply, game.whiteElo, game.blackElo, game.year);
      }
    }
    if (!next) return { opening, illegal: hasMove && ply < maxPly };
    opening = next.opening ?? opening;
    fen = next.fen;
  }
}

/** Phase 2: folds one bucket (all workers' files) into tree pages. */
export function aggregateBucket({ tmpDir, bucket, workers, minGames, topGames, pageBytes, deleteInputs = true }) {
  const files = [];
  for (let w = 0; w < workers; w += 1) {
    const file = recordFile(tmpDir, bucket, w);
    if (existsSync(file)) {
      files.push(file);
    }
  }
  let total = 0;
  for (const file of files) {
    total += statSync(file).size;
  }
  // A fresh, 4-byte aligned buffer, so it can be viewed as Uint32/Uint16 arrays.
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const file of files) {
    const chunk = readFileSync(file);
    bytes.set(chunk, at);
    at += chunk.length;
  }
  const count = total / RECORD_BYTES;
  const u32 = new Uint32Array(bytes.buffer, 0, total / 4);
  const u16 = new Uint16Array(bytes.buffer, 0, total / 2);
  const read32 = (i, field) => u32[(i * RECORD_BYTES + field) / 4];
  const read16 = (i, field) => u16[(i * RECORD_BYTES + field) / 2];
  const read8 = (i, field) => bytes[i * RECORD_BYTES + field];
  const lo = (i) => read32(i, KEY_LO);
  const hi = (i) => read32(i, KEY_HI);
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) {
    order[i] = i;
  }
  order.sort((a, b) => hi(a) - hi(b) || lo(a) - lo(b));

  const out = partFile(tmpDir, bucket);
  writeFileSync(out, new Uint8Array(0));
  const postingsFile = positionPartFile(tmpDir, bucket);
  writeFileSync(postingsFile, new Uint8Array(0));
  let postingsBytes = 0;
  const postings = new ByteWriter();
  const flushPostings = () => {
    if (postings.length > 0) {
      appendFileSync(postingsFile, postings.bytes.subarray(0, postings.length));
      postingsBytes += postings.length;
      postings.length = 0;
    }
  };
  const pages = [];
  const stats = { records: count, positions: 0, dropped: 0, moves: 0, gameRefs: 0, byPly: {} };
  let page = new ByteWriter();
  let pageFirst = null;
  const flushPage = () => {
    if (page.length === 0) {
      return;
    }
    appendFileSync(out, page.bytes.subarray(0, page.length));
    pages.push({ firstHi: pageFirst[0], firstLo: pageFirst[1], bytes: page.length });
    page = new ByteWriter();
    pageFirst = null;
  };

  let start = 0;
  while (start < count) {
    const first = order[start];
    const keyHi = hi(first);
    const keyLo = lo(first);
    let end = start + 1;
    while (end < count && hi(order[end]) === keyHi && lo(order[end]) === keyLo) {
      end += 1;
    }
    const games = end - start;
    if (games < minGames) {
      stats.dropped += 1;
      start = end;
      continue;
    }
    const moves = new Map();
    const refs = [];
    let minPly = 255;
    for (let k = start; k < end; k += 1) {
      const r = order[k];
      const gameId = read32(r, GAME_ID);
      const code = read16(r, MOVE_CODE);
      const result = read8(r, RESULT);
      const ply = read8(r, PLY);
      const whiteElo = read16(r, WHITE_ELO);
      const blackElo = read16(r, BLACK_ELO);
      const rating = averageGameRating(whiteElo, blackElo);
      const year = read16(r, YEAR);
      minPly = Math.min(minPly, ply);
      refs.push({ gameId, rating, year, whiteElo, blackElo, result });
      if (code === 0) {
        continue;
      }
      let move = moves.get(code);
      if (!move) {
        move = { code, white: 0, draws: 0, black: 0, ratingSum: 0, rated: 0, lastYear: 0 };
        moves.set(code, move);
      }
      if (result === 0) move.white += 1;
      else if (result === 1) move.draws += 1;
      else if (result === 2) move.black += 1;
      else throw new Error(`bucket ${bucket}: bad result code ${result}`);
      if (rating > 0) {
        move.ratingSum += rating;
        move.rated += 1;
      }
      move.lastYear = Math.max(move.lastYear, year);
    }
    refs.sort((a, b) => b.rating - a.rating || b.year - a.year || a.gameId - b.gameId);
    const sortedMoves = [...moves.values()]
      .sort((a, b) => b.white + b.draws + b.black - (a.white + a.draws + a.black) || a.code - b.code)
      .map((move) => ({
        code: move.code,
        white: move.white,
        draws: move.draws,
        black: move.black,
        averageRating: move.rated ? Math.round(move.ratingSum / move.rated) : 0,
        lastYear: move.lastYear,
      }));
    const gameIds = refs.slice(0, topGames).map((ref) => ref.gameId);
    if (pageFirst === null) {
      pageFirst = [keyHi, keyLo];
    }
    const gamesOffset = postingsBytes + postings.length;
    for (const ref of refs) {
      postings.u32(ref.gameId);
      postings.u16(ref.whiteElo);
      postings.u16(ref.blackElo);
      postings.u16(ref.year);
      postings.u8(ref.result);
      postings.u8(0);
      if (postings.length >= FLUSH_BYTES) flushPostings();
    }
    writeTreePosition(page, { key: (BigInt(keyHi) << 32n) | BigInt(keyLo), total: games, gamesOffset, moves: sortedMoves, gameIds });
    stats.positions += 1;
    stats.moves += sortedMoves.length;
    stats.gameRefs += gameIds.length;
    stats.byPly[minPly] = (stats.byPly[minPly] ?? 0) + 1;
    if (page.length >= pageBytes) {
      flushPage();
    }
    start = end;
  }
  flushPage();
  flushPostings();
  if (deleteInputs) {
    for (const file of files) {
      rmSync(file);
    }
  }
  return { bucket, pages, stats, postingsBytes };
}

function finalizeBucket({ tmpDir, bucket, pages, postingsBase }) {
  const file = partFile(tmpDir, bucket);
  const raw = readFileSync(file);
  writeFileSync(file, "");
  let offset = 0;
  for (const page of pages) {
    const bytes = raw.subarray(offset, offset + page.bytes);
    offset += page.bytes;
    const reader = new ByteReader(bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (!reader.done) {
      const offsetField = reader.offset + 8; // The key precedes the postings offset.
      const position = readTreePosition(reader);
      view.setBigUint64(offsetField, BigInt(position.gamesOffset + postingsBase), true);
    }
    const compressed = deflateRawSync(bytes);
    appendFileSync(file, compressed);
    page.bytes = compressed.length;
  }
  return pages;
}

if (parentPort) {
  let writer = null;
  let config = null;
  let memo = null;
  const catalog = await loadCatalog();
  const indices = new Map(catalog.map((entry, i) => [entry, i]));
  const counts = { games: 0, illegal: 0 };
  parentPort.on("message", (message) => {
    try {
      if (message.type === "init") {
        config = message;
        const openings = new Map(Array.from(indexCatalogOpenings(catalog), ([key, entry]) => [key, indices.get(entry)]));
        memo = new MoveMemo(openings);
        writer = new RecordWriter({ tmpDir: message.tmpDir, worker: message.worker, bucketBits: message.bucketBits });
        parentPort.postMessage({ type: "ready" });
      } else if (message.type === "games") {
        const openings = new Int32Array(message.games.length);
        for (const [i, game] of message.games.entries()) {
          const { opening, illegal } = replayInto(writer, game, config.maxPly, memo);
          openings[i] = opening;
          if (illegal) counts.illegal += 1;
        }
        counts.games += message.games.length;
        parentPort.postMessage({ type: "ack", openings }, [openings.buffer]);
      } else if (message.type === "flush") {
        writer.flushAll();
        parentPort.postMessage({ type: "flushed", records: writer.records, ...counts });
      } else if (message.type === "aggregate") {
        parentPort.postMessage({ type: "aggregated", ...aggregateBucket(message) });
      } else if (message.type === "finalize") {
        parentPort.postMessage({ type: "finalized", pages: finalizeBucket(message) });
      }
    } catch (error) {
      parentPort.postMessage({ type: "error", message: error instanceof Error ? error.stack ?? error.message : String(error) });
    }
  });
}
