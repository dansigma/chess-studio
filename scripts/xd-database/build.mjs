// scripts/xd-database/build.mjs
// SIG-1449: builds the Xadrez Digital database (game store, opening tree and
// player index) from PGN. Formats: src/lib/xd-database/format.ts. Runbook:
// docs/xd-database.md.
//
//   node scripts/xd-database/build.mjs source/otb.pgn [more.pgn ...] --out-dir out --version 2
//
// Inputs are .pgn, .pgn.zst, .pgn.gz or `-` (stdin), read in order and
// de-duplicated together. Games use the masters profile with an XD rating rule:
// at least one player rated >= --min-elo or both ratings missing. Games must
// be standard chess from the start position, offline, with a decided result.
// The main thread reads and filters the PGN and writes the game store and the
// player data. Workers resolve openings from the replayed moves, record tree
// positions through --max-ply, then fold the positions into the tree.
import { createHash } from "node:crypto";
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { deflateRawSync } from "node:zlib";
import {
  ByteWriter,
  GAMES_PER_BLOCK,
  GAME_ID_MASK,
  PLAYER_BLACK_BIT,
  XD_FORMAT_VERSION,
  compareUtf8,
  dateNumber,
  encodeGamesIndex,
  encodePlayersIndex,
  encodeTreeIndex,
  gameToLine,
  playerSearchKey,
  writePlayerEntry,
} from "../../src/lib/xd-database/format.ts";
import { loadCatalog } from "../../src/lib/openings-catalog.ts";
import { dedupeHash, openLines } from "../opening-book/build-book.mjs";
import { HashSet64 } from "../opening-book/hashset.mjs";
import { readGames, sanTokens } from "../opening-book/pgn.mjs";
import { normalizePlayer } from "../opening-book/players.mjs";
import { BROADCAST_SOURCES, BROADCAST_URL_PATTERN, profileRejection } from "../opening-book/profiles.mjs";
import { partFile, positionPartFile } from "./worker.mjs";

export { dateNumber };

const RATING_RULE = "anyAtLeast";
const ONLINE_EVENT_PATTERN =
  /\bCCT\d{4}\b|\b(?:champions chess tour|titled tuesday|titled arena|bullet chess championship|speed chess championship|online olympiad|banter blitz|arena kings)\b/i;
const PLACEHOLDER_PLAYER = /^(?:nn|unknown|overrated|\?*)$/i;

const USAGE =
  "usage: node scripts/xd-database/build.mjs <input.pgn[.zst|.gz] | -> ... --out-dir DIR --version N\n" +
  "  [--min-elo 1800] [--max-ply 50] [--min-games 2] [--top-games 50] [--workers N] [--tmp-dir DIR]\n" +
  "  [--max-games N] [--min-games-read N] [--page-bytes 16384] [--bucket-bits 7] [--build-date ISO] [--release TEXT]";

export const DEFAULTS = {
  minElo: 1800,
  maxPly: 50,
  minGames: 2,
  topGames: 50,
  pageBytes: 16384,
  bucketBits: 7,
  dedupePlies: 40,
};

export function parseArgs(argv) {
  const args = {
    inputs: [],
    outDir: null,
    version: null,
    ...DEFAULTS,
    workers: Math.max(1, availableParallelism() - 1),
    tmpDir: null,
    maxGames: Infinity,
    minGamesRead: 0,
    buildDate: null,
    release: null,
  };
  const numeric = {
    "--version": "version",
    "--min-elo": "minElo",
    "--max-ply": "maxPly",
    "--min-games": "minGames",
    "--top-games": "topGames",
    "--workers": "workers",
    "--max-games": "maxGames",
    "--min-games-read": "minGamesRead",
    "--page-bytes": "pageBytes",
    "--bucket-bits": "bucketBits",
  };
  const text = { "--out-dir": "outDir", "--tmp-dir": "tmpDir", "--build-date": "buildDate", "--release": "release" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token in numeric) {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 0 || (value === 0 && token !== "--bucket-bits")) {
        throw new Error(`${USAGE}\n${token} must be a positive integer`);
      }
      args[numeric[token]] = value;
      i += 1;
    } else if (token in text) {
      if (argv[i + 1] === undefined) {
        throw new Error(`${USAGE}\n${token} needs a value`);
      }
      args[text[token]] = argv[i + 1];
      i += 1;
    } else if (token === "-" || !token.startsWith("--")) {
      args.inputs.push(token);
    } else {
      throw new Error(USAGE);
    }
  }
  if (args.inputs.length === 0 || !args.outDir || !args.version) {
    throw new Error(USAGE);
  }
  if (args.maxPly > 255) {
    throw new Error(`${USAGE}\n--max-ply must be at most 255`);
  }
  if (args.bucketBits > 12) {
    throw new Error(`${USAGE}\n--bucket-bits must be at most 12`);
  }
  return args;
}

const RESULT_CODE = { "1-0": 0, "1/2-1/2": 1, "0-1": 2 };

function rating(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number < 4000 ? number : null;
}

function fideId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function present(value) {
  if (value === undefined) {
    return null;
  }
  const text = value.trim();
  return text === "" || text === "?" || text === "-" || /^\?+(\.\?+)*$/.test(text) ? null : text;
}

function placeholderPlayer(name) {
  return PLACEHOLDER_PLAYER.test((name ?? "").replace(/[\s.,\p{Pd}]/gu, ""));
}

function xdRejection(headers) {
  if (dateNumber(headers.Date) < 10000) {
    return "noYear";
  }
  if (ONLINE_EVENT_PATTERN.test((headers.Event ?? "").replace(/[\s_-]+/g, " ")) &&
      !BROADCAST_SOURCES.has(headers.Source) &&
      !BROADCAST_URL_PATTERN.test(`${headers.Site ?? ""} ${headers.Event ?? ""}`)) {
    return "online";
  }
  if (placeholderPlayer(headers.White) || placeholderPlayer(headers.Black)) {
    return "placeholderPlayer";
  }
  if ((Number(headers.WhiteElo) >= 2700 && !fideId(headers.WhiteFideId)) ||
      (Number(headers.BlackElo) >= 2700 && !fideId(headers.BlackFideId))) {
    return "implausibleRating";
  }
  return null;
}

/** Growable Uint32Array. */
class U32List {
  constructor() {
    this.data = new Uint32Array(1 << 16);
    this.length = 0;
  }

  push(value) {
    if (this.length === this.data.length) {
      const next = new Uint32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = value;
  }

  view() {
    return this.data.subarray(0, this.length);
  }
}

const NO_PLAYER = 0xffffffff;

/**
 * A flat copy of a string. Header values are V8 "sliced strings" that keep the
 * whole chunk of PGN text they were cut from alive (about 15 KB per name); kept
 * for a million players, that exhausted the heap on the full release.
 */
export function detach(text) {
  return Buffer.from(text, "utf8").toString("utf8");
}

/**
 * Player identities: the FIDE id when the game gives one, otherwise the
 * normalized name ("surname, f"). A name-only identity whose normalized name
 * belongs to exactly one FIDE identity is merged into it at the end.
 */
class PlayerRegistry {
  constructor() {
    this.ids = new Map();
    this.names = [];
    this.nameDates = [];
    this.fide = [];
    this.normalized = [];
  }

  identify(name, fide, date) {
    // normalizePlayer may return a slice of `name` (nothing to change): detach it as well.
    const normalized = detach(normalizePlayer(name));
    if (normalized === "" && fide === null) {
      return NO_PLAYER;
    }
    const key = fide !== null ? `f:${fide}` : `n:${normalized}`;
    let index = this.ids.get(key);
    if (index === undefined) {
      index = this.names.length;
      this.ids.set(key, index);
      this.names.push(detach(name));
      this.nameDates.push(date);
      this.fide.push(fide ?? 0);
      this.normalized.push(normalized);
    } else if (date >= this.nameDates[index]) {
      // The newest spelling wins (federations fix names over time).
      if (this.names[index] !== name) {
        this.names[index] = detach(name);
      }
      this.nameDates[index] = date;
    }
    return index;
  }

  /** index -> final index, merging name-only identities into a unique FIDE identity. */
  mergeMap() {
    const byName = new Map();
    this.fide.forEach((fide, index) => {
      if (fide === 0 || this.normalized[index] === "") {
        return;
      }
      const known = byName.get(this.normalized[index]);
      byName.set(this.normalized[index], known === undefined ? index : -1);
    });
    return Uint32Array.from(this.names, (_, index) => {
      if (this.fide[index] !== 0) {
        return index;
      }
      const target = byName.get(this.normalized[index]);
      return target !== undefined && target >= 0 ? target : index;
    });
  }
}

/** Writes games.bin block by block. */
class GameStore {
  constructor(file) {
    this.fd = openSync(file, "w");
    this.lines = [];
    this.offsets = [0];
    this.bytes = 0;
    this.count = 0;
    this.rawBytes = 0;
  }

  add(game) {
    this.lines.push(gameToLine(game));
    this.count += 1;
    if (this.lines.length === GAMES_PER_BLOCK) {
      this.flush();
    }
  }

  flush() {
    if (this.lines.length === 0) {
      return;
    }
    const raw = Buffer.from(this.lines.join("\n"), "utf8");
    const compressed = deflateRawSync(raw);
    writeSync(this.fd, compressed);
    this.rawBytes += raw.length;
    this.bytes += compressed.length;
    this.offsets.push(this.bytes);
    this.lines = [];
  }

  close() {
    this.flush();
    closeSync(this.fd);
  }
}

/** Worker pool with bounded in-flight batches (backpressure on the PGN reader). */
class Pool {
  constructor(size, init, writeBatch) {
    this.workers = [];
    this.waiting = [];
    this.batches = [];
    this.maxInflight = size * 4;
    this.failure = null;
    for (let i = 0; i < size; i += 1) {
      const worker = new Worker(new URL("./worker.mjs", import.meta.url));
      const state = { worker, pending: [], batches: [] };
      worker.on("message", (message) => {
        if (message.type === "error") {
          this.fail(new Error(`worker ${i}: ${message.message}`));
          return;
        }
        if (message.type === "ack") {
          if (this.failure) return;
          try {
            state.batches.shift().openings = message.openings;
            // A later batch can finish first. Keep both writes and game IDs in source order.
            while (this.batches[0]?.openings) {
              const { headers, openings } = this.batches.shift();
              writeBatch(headers, openings);
            }
          } catch (error) {
            this.fail(error);
          }
          this.waiting.shift()?.();
          return;
        }
        state.pending.shift()?.resolve(message);
      });
      worker.on("error", (error) => this.fail(error));
      this.workers.push(state);
      worker.postMessage({ type: "init", worker: i, ...init });
      state.pending.push({ resolve: () => {}, reject: () => {} });
    }
    this.next = 0;
  }

  fail(error) {
    this.failure ??= error;
    for (const state of this.workers) {
      for (const pending of state.pending.splice(0)) {
        pending.reject(error);
      }
    }
    for (const resolve of this.waiting.splice(0)) {
      resolve();
    }
  }

  async sendGames(games, headers) {
    while (this.batches.length >= this.maxInflight && !this.failure) {
      await new Promise((resolve) => this.waiting.push(resolve));
    }
    if (this.failure) {
      throw this.failure;
    }
    const state = this.workers[this.next];
    this.next = (this.next + 1) % this.workers.length;
    const batch = { headers, openings: null };
    this.batches.push(batch);
    state.batches.push(batch);
    state.worker.postMessage({ type: "games", games });
  }

  request(index, message) {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    const state = this.workers[index];
    return new Promise((resolve, reject) => {
      state.pending.push({ resolve, reject });
      state.worker.postMessage(message);
    });
  }

  async close() {
    await Promise.all(this.workers.map(({ worker }) => worker.terminate()));
  }
}

async function sha256Stream(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/**
 * Builds the database into `outDir/v<version>/`. `sources` are async iterables
 * of PGN lines. Returns the manifest.
 */
export async function buildDatabase(sources, options) {
  const started = Date.now();
  const o = { ...DEFAULTS, maxGames: Infinity, minGamesRead: 0, workers: 1, ...options };
  const dir = join(o.outDir, `v${o.version}`);
  const tmpDir = o.tmpDir ?? join(o.outDir, `tmp-v${o.version}`);
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true });
  }
  mkdirSync(dir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
  const log = o.log ?? (() => {});

  const stats = { read: 0, kept: 0, duplicates: 0, rejected: {}, noMoves: 0, endedMidGame: 0 };
  const seen = new HashSet64();
  const catalog = await loadCatalog();
  const store = new GameStore(join(dir, "games.bin"));
  const players = new PlayerRegistry();
  const gameWhite = new U32List();
  const gameBlack = new U32List();
  const gameDate = new U32List();
  let resolved = 0;
  const pool = new Pool(o.workers, { tmpDir, bucketBits: o.bucketBits, maxPly: o.maxPly }, (headers, openings) => {
    for (const [i, game] of headers.entries()) {
      const opening = catalog[openings[i]];
      if (opening) resolved += 1;
      game.openingEco = opening?.eco ?? null;
      game.openingName = opening?.name ?? null;
      store.add(game);
    }
  });
  let batch = [];
  let headers = [];
  let lastLog = Date.now();

  let storeClosed = false;
  try {
    reading: for (const source of sources) {
      const report = {};
      const classify = (headers) =>
        profileRejection("masters", headers, { minElo: o.minElo, ratingRule: RATING_RULE }) ?? xdRejection(headers);
      for await (const game of readGames(source, classify, report)) {
        stats.read += 1;
        if (game.rejected) {
          stats.rejected[game.rejected] = (stats.rejected[game.rejected] ?? 0) + 1;
        } else {
          const sans = sanTokens(game.movetext);
          if (!(game.headers.Result in RESULT_CODE)) {
            stats.rejected.result = (stats.rejected.result ?? 0) + 1;
          } else if (sans.length === 0) {
            stats.noMoves += 1;
          } else {
            const [hi, lo] = dedupeHash(game.headers, sans.slice(0, o.dedupePlies));
            if (!seen.add(hi, lo)) {
              stats.duplicates += 1;
            } else {
              const h = game.headers;
              const date = dateNumber(h.Date);
              const whiteElo = rating(h.WhiteElo);
              const blackElo = rating(h.BlackElo);
              const whiteFide = fideId(h.WhiteFideId);
              const blackFide = fideId(h.BlackFideId);
              const id = stats.kept;
              if (id > GAME_ID_MASK) throw new Error("xd-database: too many games");
              headers.push({
                white: h.White ?? "?",
                black: h.Black ?? "?",
                whiteElo,
                blackElo,
                result: h.Result,
                date: present(h.Date),
                event: present(h.Event),
                site: present(h.Site),
                round: present(h.Round),
                eco: h.ECO ?? null,
                whiteTitle: present(h.WhiteTitle),
                blackTitle: present(h.BlackTitle),
                whiteFideId: whiteFide,
                blackFideId: blackFide,
                moves: sans.join(" "),
              });
              gameWhite.push(players.identify(h.White ?? "", whiteFide, date));
              gameBlack.push(players.identify(h.Black ?? "", blackFide, date));
              gameDate.push(date);
              batch.push({
                id,
                sans,
                result: RESULT_CODE[h.Result],
                whiteElo: whiteElo ?? 0,
                blackElo: blackElo ?? 0,
                year: Math.floor(date / 10000),
              });
              if (batch.length >= 500) {
                await pool.sendGames(batch, headers);
                batch = [];
                headers = [];
              }
              stats.kept += 1;
            }
          }
        }
        if (Date.now() - lastLog > 30_000) {
          lastLog = Date.now();
          const heap = Math.round(process.memoryUsage().heapUsed / 2 ** 20);
          log(`read ${stats.read.toLocaleString("en")} games, kept ${stats.kept.toLocaleString("en")}, ${players.names.length.toLocaleString("en")} players, heap ${heap} MiB (${Math.round((Date.now() - started) / 1000)} s)`);
        }
        if (stats.kept >= o.maxGames) {
          break reading;
        }
      }
      if (report.endedMidGame) {
        stats.endedMidGame += 1;
        log("warning: an input ended in the middle of a game");
      }
    }
    if (batch.length > 0) {
      await pool.sendGames(batch, headers);
    }
    const flushed = await Promise.all(pool.workers.map((_, i) => pool.request(i, { type: "flush" })));
    store.close();
    storeClosed = true;
    if (stats.read < o.minGamesRead) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`read ${stats.read} games, fewer than --min-games-read ${o.minGamesRead}: no output written`);
    }
    stats.records = flushed.reduce((sum, f) => sum + f.records, 0);
    stats.illegalGames = flushed.reduce((sum, f) => sum + f.illegal, 0);
    const phase1Seconds = Math.round((Date.now() - started) / 1000);
    log(`phase 1 done in ${phase1Seconds} s: ${stats.kept} games, ${stats.records} position records`);

    // Phase 2: tree buckets, spread over the workers.
    const buckets = 1 << o.bucketBits;
    const results = new Array(buckets);
    let nextBucket = 0;
    await Promise.all(
      pool.workers.map(async (_, w) => {
        while (nextBucket < buckets) {
          const bucket = nextBucket++;
          results[bucket] = await pool.request(w, {
            type: "aggregate",
            tmpDir,
            bucket,
            workers: o.workers,
            minGames: o.minGames,
            topGames: o.topGames,
            pageBytes: o.pageBytes,
          });
        }
      }),
    );
    let postingsBase = 0;
    for (const result of results) {
      result.postingsBase = postingsBase;
      postingsBase += result.postingsBytes;
    }
    nextBucket = 0;
    await Promise.all(
      pool.workers.map(async (_, w) => {
        while (nextBucket < buckets) {
          const result = results[nextBucket++];
          const finalized = await pool.request(w, {
            type: "finalize",
            tmpDir,
            bucket: result.bucket,
            pages: result.pages,
            postingsBase: result.postingsBase,
          });
          result.pages = finalized.pages;
        }
      }),
    );
    const firstKeys = [];
    const offsets = [];
    const tree = { positions: 0, droppedPositions: 0, moves: 0, gameRefs: 0, byPly: {} };
    let offset = 0;
    const treeFd = openSync(join(dir, "tree.bin"), "w");
    try {
      const postingsFd = openSync(join(dir, "position-games.bin"), "w");
      try {
        for (const result of results) {
          const part = partFile(tmpDir, result.bucket);
          const postings = positionPartFile(tmpDir, result.bucket);
          writeSync(treeFd, readFileSync(part));
          for await (const chunk of createReadStream(postings)) {
            writeSync(postingsFd, chunk);
          }
          rmSync(part);
          rmSync(postings);
          for (const page of result.pages) {
            firstKeys.push((BigInt(page.firstHi) << 32n) | BigInt(page.firstLo));
            offsets.push(offset);
            offset += page.bytes;
          }
          tree.positions += result.stats.positions;
          tree.droppedPositions += result.stats.dropped;
          tree.moves += result.stats.moves;
          tree.gameRefs += result.stats.gameRefs;
          for (const [ply, count] of Object.entries(result.stats.byPly)) {
            tree.byPly[ply] = (tree.byPly[ply] ?? 0) + count;
          }
        }
      } finally {
        closeSync(postingsFd);
      }
    } finally {
      closeSync(treeFd);
    }
    offsets.push(offset);
    writeFileSync(join(dir, "tree.idx"), encodeTreeIndex({ maxPly: o.maxPly, firstKeys, offsets }));
    writeFileSync(join(dir, "games.idx"), encodeGamesIndex({ gamesPerBlock: GAMES_PER_BLOCK, gameCount: store.count, offsets: store.offsets }));
    log(`phase 2 done: ${tree.positions} positions, ${firstKeys.length} pages`);

    const playerStats = writePlayers(dir, players, gameWhite.view(), gameBlack.view(), gameDate.view(), o.pageBytes);

    const files = {};
    for (const name of ["games.bin", "games.idx", "tree.bin", "tree.idx", "players.bin", "players.idx", "player-games.bin", "position-games.bin"]) {
      const file = join(dir, name);
      files[name] = { bytes: statSync(file).size, sha256: await sha256Stream(file) };
    }
    const manifest = {
      name: "xadrez-digital-database",
      version: o.version,
      formatVersion: XD_FORMAT_VERSION,
      buildDate: o.buildDate ?? new Date().toISOString(),
      release: o.release ?? null,
      rules: { profile: "masters", ratingRule: RATING_RULE, minElo: o.minElo, maxPly: o.maxPly, minGames: o.minGames, topGames: o.topGames, dedupePlies: o.dedupePlies },
      layout: { gamesPerBlock: GAMES_PER_BLOCK, treePages: firstKeys.length, pageBytes: o.pageBytes },
      stats: {
        gamesRead: stats.read,
        gamesKept: stats.kept,
        openings: { resolved, unresolved: stats.kept - resolved },
        duplicates: stats.duplicates,
        noMoves: stats.noMoves,
        rejected: stats.rejected,
        illegalGames: stats.illegalGames,
        endedMidGame: stats.endedMidGame,
        positionRecords: stats.records,
        positions: tree.positions,
        positionsBelowMinGames: tree.droppedPositions,
        moves: tree.moves,
        gameRefs: tree.gameRefs,
        positionsByPly: tree.byPly,
        gamesRawBytes: store.rawBytes,
        ...playerStats,
        seconds: Math.round((Date.now() - started) / 1000),
        phase1Seconds,
        peakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
      },
      files,
    };
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    rmSync(tmpDir, { recursive: true, force: true });
    return manifest;
  } finally {
    await pool.close();
    if (!storeClosed) closeSync(store.fd);
  }
}

/** players.bin, players.idx and player-games.bin. */
export function writePlayers(dir, players, white, black, dates, pageBytes) {
  const merge = players.mergeMap();
  const count = new Uint32Array(players.names.length);
  const games = white.length;
  const refPlayer = new Uint32Array(games * 2);
  let refs = 0;
  for (let id = 0; id < games; id += 1) {
    for (const p of [white[id], black[id]]) {
      if (p !== NO_PLAYER) {
        refPlayer[refs] = merge[p];
        count[merge[p]] += 1;
        refs += 1;
      }
    }
  }
  // Group the references by player with a counting sort, then order each player's games newest first.
  const start = new Uint32Array(players.names.length + 1);
  for (let p = 0; p < players.names.length; p += 1) {
    start[p + 1] = start[p] + count[p];
  }
  const fill = start.slice(0, players.names.length);
  const postings = new Uint32Array(refs);
  for (let id = 0; id < games; id += 1) {
    if (white[id] !== NO_PLAYER) postings[fill[merge[white[id]]]++] = id;
    if (black[id] !== NO_PLAYER) postings[fill[merge[black[id]]]++] = id | PLAYER_BLACK_BIT;
  }
  const first = new Uint32Array(players.names.length);
  const last = new Uint32Array(players.names.length);
  for (let p = 0; p < players.names.length; p += 1) {
    const slice = postings.subarray(start[p], start[p + 1]);
    slice.sort((a, b) => dates[b & GAME_ID_MASK] - dates[a & GAME_ID_MASK] || (b & GAME_ID_MASK) - (a & GAME_ID_MASK));
    for (const posting of slice) {
      const id = posting & GAME_ID_MASK;
      const year = Math.floor(dates[id] / 10000);
      if (year > 0) {
        first[p] = first[p] === 0 ? year : Math.min(first[p], year);
        last[p] = Math.max(last[p], year);
      }
    }
  }
  writeFileSync(join(dir, "player-games.bin"), new Uint8Array(postings.buffer, 0, refs * 4));

  const entries = [];
  for (let p = 0; p < players.names.length; p += 1) {
    if (merge[p] !== p || count[p] === 0) {
      continue;
    }
    entries.push({
      searchKey: playerSearchKey(players.names[p]),
      name: players.names[p],
      fideId: players.fide[p],
      start: start[p],
      count: count[p],
      firstYear: first[p],
      lastYear: last[p],
    });
  }
  entries.sort((a, b) => compareUtf8(a.searchKey, b.searchKey) || b.count - a.count || a.fideId - b.fideId || a.start - b.start);
  const fd = openSync(join(dir, "players.bin"), "w");
  const firstKeys = [];
  const offsets = [];
  let offset = 0;
  let page = new ByteWriter();
  let pageFirst = null;
  const flush = () => {
    if (page.length === 0) {
      return;
    }
    const compressed = deflateRawSync(page.result());
    writeSync(fd, compressed);
    firstKeys.push(pageFirst);
    offsets.push(offset);
    offset += compressed.length;
    page = new ByteWriter();
    pageFirst = null;
  };
  for (const entry of entries) {
    pageFirst ??= entry.searchKey;
    writePlayerEntry(page, entry);
    if (page.length >= pageBytes) {
      flush();
    }
  }
  flush();
  offsets.push(offset);
  closeSync(fd);
  writeFileSync(join(dir, "players.idx"), encodePlayersIndex({ playerCount: entries.length, firstKeys, offsets }));
  return { players: entries.length, playerRefs: refs };
}

export async function run(argv, deps = {}) {
  const args = parseArgs(argv);
  const sources = args.inputs.map((name) => (deps.openLines ?? openLines)(name));
  const log = deps.log ?? ((line) => process.stderr.write(`${line}\n`));
  return buildDatabase(sources, { ...args, log });
}

async function main() {
  try {
    const manifest = await run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
