// scripts/opening-book/build-book.mjs
// SIG-1226: build the local opening book from Lichess standard rated dumps
// (https://database.lichess.org, CC0).
//
//   zstd -dc lichess_db_standard_rated_2024-01.pgn.zst | \
//     node scripts/opening-book/build-book.mjs - --out-dir out --version 1 --months 2024-01
//   node scripts/opening-book/build-book.mjs a.pgn.zst b.pgn --out-dir out --version 1
//
// Inputs are .pgn, .pgn.zst (needs the `zstd` binary), .pgn.gz or `-` (stdin).
// Games are filtered on their headers (both players >= --min-elo, blitz/rapid/
// classical by TimeControl, standard chess, not aborted, at least 10 moves);
// every move up to --max-ply is counted per position (keyed by the app's
// 64-bit position hash) and only theory is kept, with the SAME rule constants
// as the explorer book (BOOK_RULE: position >= 100 games, move >= 20 games and
// >= 3%). Output: opening-book-v<N>.bin.gz (format in
// src/chess/opening-book-format.ts) and opening-book-v<N>.manifest.json.
// Memory is bounded by --max-map-entries (see counts.mjs).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { gzipSync, createGunzip } from "node:zlib";
import { pathToFileURL } from "node:url";
import { Chess } from "chess.js";
import { BOOK_RULE, LOCAL_BOOK_BUILD } from "../../src/chess/opening-theory.ts";
import { bookKey } from "../../src/chess/opening-book.ts";
import { FORMAT_VERSION, encodeBook, encodeMove } from "../../src/chess/opening-book-format.ts";
import { headerRejection, lastMoveNumber, linesOf, readGames, sanTokens } from "./pgn.mjs";
import { CountStore, selectTheory } from "./counts.mjs";

const USAGE =
  "usage: node scripts/opening-book/build-book.mjs <input.pgn[.zst|.gz] | -> ... --out-dir DIR --version N\n" +
  "  [--min-elo 2300] [--max-ply 40] [--max-games N] [--max-map-entries 3000000]\n" +
  "  [--tmp-dir DIR] [--months 2024-01,2024-02] [--build-date ISO] [--app-manifest PATH]";

export function parseArgs(argv) {
  const args = {
    inputs: [],
    outDir: null,
    version: null,
    minElo: LOCAL_BOOK_BUILD.minElo,
    maxPly: LOCAL_BOOK_BUILD.maxPly,
    maxGames: Infinity,
    maxMapEntries: 3_000_000,
    tmpDir: null,
    months: null,
    buildDate: null,
    appManifest: null,
  };
  const numeric = { "--version": "version", "--min-elo": "minElo", "--max-ply": "maxPly", "--max-games": "maxGames", "--max-map-entries": "maxMapEntries" };
  const text = { "--out-dir": "outDir", "--tmp-dir": "tmpDir", "--build-date": "buildDate", "--app-manifest": "appManifest" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token in numeric) {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) {
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
    } else if (token === "--months") {
      args.months = (argv[i + 1] ?? "").split(",").filter(Boolean);
      i += 1;
    } else if (token === "--help" || token === "-h" || (token.startsWith("--") && token !== "-")) {
      throw new Error(USAGE);
    } else {
      args.inputs.push(token);
    }
  }
  if (args.inputs.length === 0 || !args.outDir || !args.version) {
    throw new Error(USAGE);
  }
  if (args.maxPly > 255) {
    throw new Error(`${USAGE}\n--max-ply must be at most 255`);
  }
  return args;
}

/** Opens a dump as a text stream; .zst goes through the `zstd` binary. */
export function openInput(name) {
  if (name === "-") {
    return process.stdin;
  }
  if (name.endsWith(".zst")) {
    const child = spawn("zstd", ["-dc", "--long=31", name], { stdio: ["ignore", "pipe", "inherit"] });
    child.on("error", (error) => {
      console.error(`could not run zstd (${error.message}); pipe it instead: zstd -dc ${name} | node ... -`);
      process.exit(1);
    });
    return child.stdout;
  }
  const file = createReadStream(name);
  return name.endsWith(".gz") ? file.pipe(createGunzip()) : file;
}

/**
 * Counts one game's first `maxPly` moves. Returns false (and counts nothing)
 * when a move is illegal. The key is of the position BEFORE the move.
 */
export function countGame(store, tokens, maxPly) {
  const board = new Chess();
  const pairs = [];
  for (let ply = 0; ply < Math.min(tokens.length, maxPly); ply += 1) {
    const key = bookKey(board.fen());
    let move;
    try {
      move = board.move(tokens[ply]);
    } catch {
      return false;
    }
    pairs.push([key, encodeMove(move.from + move.to + (move.promotion ?? ""))]);
  }
  for (const [key, code] of pairs) {
    store.add(key, code);
  }
  return true;
}

/**
 * Reads games from `sources` (async iterables of lines), filters, counts and
 * returns the encoded book. `now` is injectable for deterministic tests.
 */
export async function buildBook(sources, options) {
  const started = Date.now();
  const rule = BOOK_RULE;
  const store = new CountStore({ maxEntries: options.maxMapEntries, tmpDir: options.tmpDir });
  const stats = { read: 0, kept: 0, rejected: { elo: 0, speed: 0, variant: 0, aborted: 0 }, tooShort: 0, illegal: 0 };
  let peakRss = 0;
  try {
    outer: for (const lines of sources) {
      for await (const game of readGames(lines, (headers) => headerRejection(headers, options.minElo))) {
        stats.read += 1;
        if (stats.read % 1_000_000 === 0) {
          peakRss = Math.max(peakRss, process.memoryUsage().rss);
          console.error(`read ${stats.read} games, kept ${stats.kept}, rss ${(peakRss / 2 ** 20).toFixed(0)} MiB`);
        }
        if (game.rejected) {
          stats.rejected[game.rejected] += 1;
          continue;
        }
        if (lastMoveNumber(game.movetext) < LOCAL_BOOK_BUILD.minGameMoves) {
          stats.tooShort += 1;
          continue;
        }
        if (!countGame(store, sanTokens(game.movetext, options.maxPly), options.maxPly)) {
          stats.illegal += 1;
          continue;
        }
        stats.kept += 1;
        if (stats.kept >= options.maxGames) {
          break outer;
        }
      }
    }
    const theory = selectTheory(store.merged(), rule);
    peakRss = Math.max(peakRss, process.memoryUsage().rss, process.resourceUsage().maxRSS * 1024);
    const raw = encodeBook(theory.entries, { maxPly: options.maxPly });
    const gz = gzipSync(raw, { level: 9 });
    const months = options.months ?? [];
    const manifest = {
      version: options.version,
      format: FORMAT_VERSION,
      file: `opening-book-v${options.version}.bin.gz`,
      builtAt: options.buildDate ?? new Date().toISOString(),
      months,
      games: stats.kept,
      gamesRead: stats.read,
      minElo: options.minElo,
      speeds: LOCAL_BOOK_BUILD.speeds,
      maxPly: options.maxPly,
      thresholds: {
        minPositionGames: rule.minPositionGames,
        minMoveGames: rule.minMoveGames,
        minMoveShare: rule.minMoveShare,
      },
      positions: theory.positions,
      moves: theory.entries.length,
      bytes: raw.length,
      gzipBytes: gz.length,
      sha256: createHash("sha256").update(gz).digest("hex"),
    };
    return {
      raw,
      gz,
      manifest,
      stats: {
        ...stats,
        positionsSeen: theory.positionsSeen,
        movesSeen: theory.movesSeen,
        spills: store.spills,
        seconds: (Date.now() - started) / 1000,
        peakRssMiB: Math.round(peakRss / 2 ** 20),
      },
    };
  } finally {
    store.dispose();
  }
}

/** Text of src/chess/opening-book-manifest.ts for a built manifest. */
export function appManifestSource(manifest) {
  return (
    "// SIG-1226: the DEPLOYED local opening book. Written by\n" +
    "// scripts/opening-book/build-book.mjs --app-manifest; `version` is part of the review\n" +
    "// cache key, `file` is the versioned object under /book/ (R2 key book/<file>).\n" +
    `export const OPENING_BOOK_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;\n`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const months =
    args.months ??
    args.inputs.map((name) => /(\d{4}-\d{2})/.exec(basename(name))?.[1]).filter(Boolean);
  const sources = args.inputs.map((name) => linesOf(openInput(name)));
  const result = await buildBook(sources, { ...args, months });
  mkdirSync(args.outDir, { recursive: true });
  const base = join(args.outDir, result.manifest.file);
  writeFileSync(base, result.gz);
  writeFileSync(join(args.outDir, `opening-book-v${args.version}.manifest.json`), `${JSON.stringify(result.manifest, null, 2)}\n`);
  if (args.appManifest) {
    writeFileSync(args.appManifest, appManifestSource(result.manifest));
  }
  console.log(JSON.stringify({ ...result.manifest, stats: result.stats }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
