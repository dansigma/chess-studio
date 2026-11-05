// SIG-1221: add engine ground truth to validation-set items.
//
//   node --import ./scripts/test-resolve.mjs scripts/valset/ground-truth.mjs \
//        valset-data/items.jsonl --out valset-data/items.truth.jsonl \
//        [--depth 18] [--multipv 3] [--threshold 50] [--cache valset-data/engine-cache.json]
//
// For each item: MultiPV analysis of the position before the move, a search of
// the position after the played move, and (when the author's move is not among
// the engine lines) a `searchmoves` search of the author's move. Results are
// cached by FEN + depth so reruns are cheap and the engine is only started on a
// cache miss. Scores are stored from the mover's point of view.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Chess } from "chess.js";
import { BAD_MOVE_NAGS, GOOD_MOVE_NAGS, parseJsonl, toJsonl, validateItems } from "./schema.mjs";
import { NO_ENGINE_MESSAGE, UciEngine, findStockfish, negateScore, scoreToCp } from "./uci.mjs";

export const DEFAULT_DEPTH = 18;
export const DEFAULT_MULTIPV = 3;
export const DEFAULT_THRESHOLD_CP = 50;

export function cacheKey(fen, depth, multipv, searchmoves = []) {
  return `${fen.split(" ").slice(0, 4).join(" ")}|d${depth}|pv${multipv}|${searchmoves.join(",")}`;
}

export function loadCache(path) {
  if (path && existsSync(path)) {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return { version: 1, engine: data.engine ?? null, entries: data.entries ?? {} };
  }
  return { version: 1, engine: null, entries: {} };
}

export function saveCache(path, cache) {
  mkdirSync(dirname(path), { recursive: true });
  const entries = Object.fromEntries(Object.keys(cache.entries).sort().map((key) => [key, cache.entries[key]]));
  writeFileSync(path, `${JSON.stringify({ version: 1, engine: cache.engine, entries }, null, 1)}\n`);
}

/** UCI line -> SAN line, stopping at the first illegal move. */
export function pvToSan(fen, pv) {
  const board = new Chess(fen);
  const out = [];
  for (const uci of pv) {
    try {
      out.push(board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

/**
 * Cache-backed analysis. `source` is `{ engine, cache }`; the engine is started
 * lazily through `source.getEngine()` so fully cached runs need no binary.
 */
export async function lookup(source, fen, { depth, multipv, searchmoves = [] }) {
  const key = cacheKey(fen, depth, multipv, searchmoves);
  const hit = source.cache.entries[key];
  if (hit) return hit;
  const engine = await source.getEngine();
  const result = await engine.analyze(fen, { depth, multipv, searchmoves });
  const entry = {
    bestmove: result.bestmove,
    lines: result.lines.map((line) => ({ rank: line.rank, score: line.score, pv: line.pv })),
  };
  source.cache.entries[key] = entry;
  source.cache.engine = engine.name;
  source.dirty = (source.dirty ?? 0) + 1;
  return entry;
}

function authorMoveOf(item) {
  if (item.authorBestMove) return { move: item.authorBestMove, explicit: true };
  if (item.nags.some((nag) => GOOD_MOVE_NAGS.includes(nag))) return { move: item.playedMove, explicit: false };
  return null;
}

/**
 * Attach `engine` and `authorDisagrees` to one item.
 * Disagreement reasons (each is a plain string in `authorDisagrees.reasons`):
 *  - author-move-worse-than-engine: the author's recommended move is more than
 *    `thresholdCp` below the engine's top line.
 *  - nag-bad-but-engine-fine: the author marks the move ?, ?? or ?! but the
 *    engine loses at most `thresholdCp` by it.
 *  - nag-good-but-engine-loses: the author marks it ! or !! but the engine
 *    loses more than `thresholdCp` by it.
 */
export async function addGroundTruth(item, source, options) {
  const { depth, multipv, thresholdCp } = options;
  const before = await lookup(source, item.fen, { depth, multipv });
  const top = before.lines[0] ?? null;
  const mover = new Chess(item.fen);
  const played = mover.move({ from: item.playedMove.uci.slice(0, 2), to: item.playedMove.uci.slice(2, 4), promotion: item.playedMove.uci[4] });
  const fenAfter = mover.fen();

  let evalAfter = null;
  if (mover.isCheckmate()) {
    evalAfter = { score: { mate: 1 }, pv: [], pvSan: [] };
  } else if (!mover.isGameOver()) {
    const after = await lookup(source, fenAfter, { depth, multipv: 1 });
    const line = after.lines[0];
    if (line) {
      evalAfter = { score: negateScore(line.score), pv: line.pv, pvSan: pvToSan(fenAfter, line.pv) };
    }
  } else {
    evalAfter = { score: { cp: 0 }, pv: [], pvSan: [] };
  }

  const playedLine = before.lines.find((line) => line.pv[0] === item.playedMove.uci) ?? null;
  const playedScore = playedLine?.score ?? evalAfter?.score ?? null;

  const author = authorMoveOf(item);
  let authorMoveScore = null;
  if (author) {
    if (author.move.uci === item.playedMove.uci) {
      authorMoveScore = playedScore;
    } else {
      const inLines = before.lines.find((line) => line.pv[0] === author.move.uci);
      if (inLines) {
        authorMoveScore = inLines.score;
      } else {
        const only = await lookup(source, item.fen, { depth, multipv: 1, searchmoves: [author.move.uci] });
        authorMoveScore = only.lines[0]?.score ?? null;
      }
    }
  }

  const topCp = scoreToCp(top?.score);
  const lossCp = topCp !== null && playedScore ? Math.max(0, topCp - scoreToCp(playedScore)) : null;
  const reasons = [];
  if (author?.explicit && authorMoveScore && topCp !== null && topCp - scoreToCp(authorMoveScore) > thresholdCp) {
    reasons.push("author-move-worse-than-engine");
  }
  if (lossCp !== null && item.nags.some((nag) => BAD_MOVE_NAGS.includes(nag)) && lossCp <= thresholdCp) {
    reasons.push("nag-bad-but-engine-fine");
  }
  if (lossCp !== null && item.nags.some((nag) => GOOD_MOVE_NAGS.includes(nag)) && lossCp > thresholdCp) {
    reasons.push("nag-good-but-engine-loses");
  }

  return {
    ...item,
    engine: {
      engine: source.cache.engine ?? "unknown",
      depth,
      multipv,
      bestmove: before.bestmove ?? top?.pv[0] ?? null,
      lines: before.lines.map((line) => ({ rank: line.rank, score: line.score, pv: line.pv, pvSan: pvToSan(item.fen, line.pv) })),
      playedLineScore: playedLine?.score ?? null,
      evalBefore: top?.score ?? null,
      evalAfter,
      authorMoveScore,
      lossCp,
      playedSan: played.san,
    },
    authorDisagrees: { flag: reasons.length > 0, reasons },
  };
}

export async function addGroundTruthAll(items, source, options, onProgress) {
  const out = [];
  for (const [index, item] of items.entries()) {
    out.push(await addGroundTruth(item, source, options));
    onProgress?.(index + 1, items.length);
  }
  return out;
}

export async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      depth: { type: "string", default: String(DEFAULT_DEPTH) },
      multipv: { type: "string", default: String(DEFAULT_MULTIPV) },
      threshold: { type: "string", default: String(DEFAULT_THRESHOLD_CP) },
      cache: { type: "string", default: "valset-data/engine-cache.json" },
      stockfish: { type: "string" },
      threads: { type: "string", default: "1" },
    },
  });
  if (positionals.length !== 1 || !values.out) {
    console.error("usage: ground-truth.mjs <items.jsonl> --out <items.truth.jsonl> [--depth 18] [--multipv 3] [--threshold 50] [--cache file] [--stockfish path]");
    return 2;
  }
  const items = parseJsonl(readFileSync(positionals[0], "utf8"), positionals[0]);
  const check = validateItems(items);
  if (!check.ok) {
    console.error(check.errors.join("\n"));
    return 1;
  }
  const options = { depth: Number(values.depth), multipv: Number(values.multipv), thresholdCp: Number(values.threshold) };
  const source = { cache: loadCache(values.cache), engine: null, dirty: 0 };
  source.getEngine = async () => {
    if (!source.engine) {
      const path = findStockfish(values.stockfish);
      if (!path) throw new Error(NO_ENGINE_MESSAGE);
      source.engine = await UciEngine.start(path, { threads: Number(values.threads) });
    }
    return source.engine;
  };
  try {
    const enriched = await addGroundTruthAll(items, source, options, (done, total) => {
      if (done % 25 === 0 || done === total) console.error(`ground truth ${done}/${total}`);
      if (source.dirty >= 50) {
        saveCache(values.cache, source.cache);
        source.dirty = 0;
      }
    });
    mkdirSync(dirname(values.out), { recursive: true });
    writeFileSync(values.out, toJsonl(enriched));
    const flagged = enriched.filter((item) => item.authorDisagrees.flag).length;
    console.log(`wrote ${values.out}: ${enriched.length} items, ${flagged} where the author disagrees with the engine`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    if (source.dirty > 0) saveCache(values.cache, source.cache);
    await source.engine?.quit();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
