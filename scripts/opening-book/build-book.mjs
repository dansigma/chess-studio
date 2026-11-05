// scripts/opening-book/build-book.mjs
// SIG-1226/1229: build a local opening book from game databases.
//
//   zstd -dc lichess_db_standard_rated_2026-05.pgn.zst | \
//     node scripts/opening-book/build-book.mjs - --out-dir out --version 3 --months 2026-05
//   node scripts/opening-book/build-book.mjs a.pgn.zst b.pgn.zst --out-dir out --version 3
//   node scripts/opening-book/build-book.mjs masters.pgn --profile masters --out-dir out-masters --version 3
//
// Inputs are .pgn, .pgn.zst (needs the `zstd` binary), .pgn.gz or `-` (stdin).
// Piping `zstd -dc FILE | node ... -` works the same on every OS and is the
// form the runbook recommends. A decompressor that dies or exits non-zero makes
// the build FAIL: nothing is written (see zstdLines).
//
// --profile (profiles.mjs): lichess (default) | masters | correspondence.
// Games are filtered on their headers; every move up to --max-ply is counted
// per position (keyed by the app's 64-bit position hash) and only theory is
// kept: BOOK_RULE (position >= 100 games, move >= 20 games and >= 1% of the
// position) and, for masters/correspondence, >= 5 distinct players who made
// the move. Those two profiles also de-duplicate games (normalized players +
// Date + Round + the first --max-ply moves), also across several input files.
// Output: opening-book-v<N>.bin.gz (format in src/chess/opening-book-format.ts)
// and opening-book-v<N>.manifest.json. Memory is bounded by --max-map-entries
// (counts.mjs) plus, for de-duplication, about 18 bytes per game seen.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { gzipSync, createGunzip } from "node:zlib";
import { pathToFileURL } from "node:url";
import { Chess } from "chess.js";
import { BOOK_RULE, LOCAL_BOOK_BUILD } from "../../src/chess/opening-theory.ts";
import { bookKey } from "../../src/chess/opening-book.ts";
import { FORMAT_VERSION, encodeBook, encodeMove } from "../../src/chess/opening-book-format.ts";
import { lastMoveNumber, linesOf, readGames, sanTokens } from "./pgn.mjs";
import { CountStore, selectTheory } from "./counts.mjs";
import { HashSet64, hash64 } from "./hashset.mjs";
import { normalizePlayer, playerHash } from "./players.mjs";
import {
  EXPECTED_LICHESS_GAMES_PER_MONTH,
  PROFILES,
  PROFILE_NAMES,
  profileRejection,
} from "./profiles.mjs";

const USAGE =
  "usage: node scripts/opening-book/build-book.mjs <input.pgn[.zst|.gz] | -> ... --out-dir DIR --version N\n" +
  "  [--profile lichess|masters|correspondence] [--min-elo N] [--min-players N] [--max-ply 40]\n" +
  "  [--max-games N] [--min-games-read N] [--max-map-entries 3000000] [--tmp-dir DIR]\n" +
  "  [--months 2026-05,2026-06] [--assume-correspondence] [--license TEXT] [--attribution TEXT] [--build-date ISO] [--app-manifest PATH]";

/** Warn when a dump read this fraction of the expected games or less. */
const SANITY_FRACTION = 0.1;

export function parseArgs(argv) {
  const args = {
    inputs: [],
    outDir: null,
    version: null,
    profile: "lichess",
    minElo: null,
    minDistinctPlayers: null,
    maxPly: LOCAL_BOOK_BUILD.maxPly,
    maxGames: Infinity,
    minGamesRead: 0,
    maxMapEntries: 3_000_000,
    tmpDir: null,
    months: null,
    buildDate: null,
    appManifest: null,
    license: null,
    attribution: null,
    assumeCorrespondence: false,
  };
  const numeric = {
    "--version": "version",
    "--min-elo": "minElo",
    "--min-players": "minDistinctPlayers",
    "--max-ply": "maxPly",
    "--max-games": "maxGames",
    "--min-games-read": "minGamesRead",
    "--max-map-entries": "maxMapEntries",
  };
  const text = { "--out-dir": "outDir", "--tmp-dir": "tmpDir", "--build-date": "buildDate", "--app-manifest": "appManifest", "--license": "license", "--attribution": "attribution" };
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
    } else if (token === "--profile") {
      if (!PROFILE_NAMES.includes(argv[i + 1])) {
        throw new Error(`${USAGE}\n--profile must be one of ${PROFILE_NAMES.join(", ")}`);
      }
      args.profile = argv[i + 1];
      i += 1;
    } else if (token === "--months") {
      args.months = (argv[i + 1] ?? "").split(",").filter(Boolean);
      i += 1;
    } else if (token === "--assume-correspondence") {
      args.assumeCorrespondence = true;
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
  args.minElo ??= PROFILES[args.profile].minElo;
  return args;
}

/** What it takes to run an external decompressor; injectable so tests can use a fake one. */
export function zstdCommand(name) {
  return { command: process.env.OPENING_BOOK_ZSTD || "zstd", args: ["-dc", "--long=31", name] };
}

/**
 * Lines of a compressed dump, read through an external decompressor. The
 * decompressor's stdout is consumed as a stream (the consumer pulls, the pipe
 * pauses: backpressure) and, once the lines are exhausted, its exit status is
 * checked: a non-zero exit, a signal or a spawn failure throws, so a build can
 * never silently continue with the part of the file that got through (SIG-1227).
 * Closing the generator early (--max-games) stops the child without an error.
 */
export async function* zstdLines(name, { command = zstdCommand, spawnImpl = spawn } = {}) {
  const { command: file, args } = command(name);
  const child = spawnImpl(file, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-2000);
  });
  const exit = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  let finished = false;
  try {
    yield* linesOf(child.stdout);
    finished = true;
  } finally {
    if (!finished) {
      child.kill();
    }
  }
  const { code, signal, error } = await exit;
  const tail = stderr.trim() ? `: ${stderr.trim()}` : "";
  if (error) {
    throw new Error(`could not run ${file} (${error.message}); pipe it instead: ${file} -dc ${name} | node ... -`);
  }
  if (signal) {
    throw new Error(`${file} was killed by ${signal} while reading ${name}; the input is incomplete, no book written${tail}`);
  }
  if (code !== 0) {
    throw new Error(`${file} exited with code ${code} while reading ${name}; the input is incomplete, no book written${tail}`);
  }
}

/** Opens a dump as lines; .zst goes through the `zstd` binary. */
export function openLines(name, deps = {}) {
  if (name === "-") {
    return linesOf(process.stdin);
  }
  if (name.endsWith(".zst")) {
    return zstdLines(name, deps);
  }
  const file = createReadStream(name);
  return linesOf(name.endsWith(".gz") ? file.pipe(createGunzip()) : file);
}

/**
 * Replays up to `maxPly` SAN moves from the start position. Returns the list of
 * { key, code } (the key is of the position BEFORE the move), or null when a
 * move is illegal.
 */
export function replayGame(tokens, maxPly) {
  const board = new Chess();
  const pairs = [];
  for (let ply = 0; ply < Math.min(tokens.length, maxPly); ply += 1) {
    const key = bookKey(board.fen());
    let move;
    try {
      move = board.move(tokens[ply]);
    } catch {
      return null;
    }
    pairs.push({ key, code: encodeMove(move.from + move.to + (move.promotion ?? "")) });
  }
  return pairs;
}

/** Counts one game (for tests and the Lichess profile). False when a move is illegal. */
export function countGame(store, tokens, maxPly) {
  const pairs = replayGame(tokens, maxPly);
  if (!pairs) {
    return false;
  }
  for (const { key, code } of pairs) {
    store.add(key, code);
  }
  return true;
}

/**
 * Identity of a game for de-duplication: normalized players, Date, Round (when
 * present) and the first moves as SAN without check/capture-annotation marks.
 * Computed BEFORE the moves are replayed, so a duplicate (the overlap between
 * collections is large) costs no chess.js work.
 */
function dedupeHash(headers, tokens) {
  const round = headers.Round && headers.Round !== "?" && headers.Round !== "-" ? headers.Round : "";
  const moves = tokens.map((token) => token.replace(/[+#!?]/g, "")).join(" ");
  return hash64(`${normalizePlayer(headers.White)}|${normalizePlayer(headers.Black)}|${headers.Date ?? ""}|${round}|${moves}`);
}

/**
 * Reads games from `sources` (async iterables of lines), filters, counts and
 * returns the encoded book. Throws (before anything is encoded) when a source
 * fails or fewer than --min-games-read games were read.
 */
export async function buildBook(sources, options) {
  const started = Date.now();
  const profile = options.profile ?? "lichess";
  const config = PROFILES[profile];
  const minElo = options.minElo ?? config.minElo;
  const minDistinctPlayers = options.minDistinctPlayers ?? config.minDistinctPlayers;
  const dedupe = options.dedupe ?? config.dedupe;
  const maxGames = options.maxGames ?? Infinity;
  const rule = { ...BOOK_RULE, minDistinctPlayers };
  const track = minDistinctPlayers > 0;
  const store = new CountStore({ maxEntries: options.maxMapEntries ?? 3_000_000, tmpDir: options.tmpDir ?? null, trackPlayers: track });
  const seen = dedupe ? new HashSet64() : null;
  const warnings = [];
  const perInput = [];
  const stats = { read: 0, kept: 0, rejected: {}, tooShort: 0, illegal: 0, duplicates: 0 };
  let peakRss = 0;
  try {
    outer: for (const [index, lines] of sources.entries()) {
      const report = {};
      const label = options.sourceNames?.[index] ?? `input ${index + 1}`;
      const input = { file: label, read: 0, kept: 0, duplicates: 0 };
      perInput.push(input);
      for await (const game of readGames(lines, (headers) => profileRejection(profile, headers, { minElo, assumeCorrespondence: options.assumeCorrespondence }), report)) {
        stats.read += 1;
        input.read += 1;
        if (stats.read % 1_000_000 === 0) {
          peakRss = Math.max(peakRss, process.memoryUsage().rss);
          console.error(`read ${stats.read} games, kept ${stats.kept}, duplicates ${stats.duplicates}, rss ${(peakRss / 2 ** 20).toFixed(0)} MiB`);
        }
        if (game.rejected) {
          stats.rejected[game.rejected] = (stats.rejected[game.rejected] ?? 0) + 1;
          continue;
        }
        if (lastMoveNumber(game.movetext) < LOCAL_BOOK_BUILD.minGameMoves) {
          stats.tooShort += 1;
          continue;
        }
        const tokens = sanTokens(game.movetext, options.maxPly);
        if (seen) {
          const [hi, lo] = dedupeHash(game.headers, tokens);
          if (!seen.add(hi, lo)) {
            stats.duplicates += 1;
            input.duplicates += 1;
            continue;
          }
        }
        const pairs = replayGame(tokens, options.maxPly);
        if (!pairs) {
          stats.illegal += 1;
          continue;
        }
        const white = track ? playerHash(normalizePlayer(game.headers.White)) : 0;
        const black = track ? playerHash(normalizePlayer(game.headers.Black)) : 0;
        pairs.forEach(({ key, code }, ply) => store.add(key, code, ply % 2 === 0 ? white : black));
        stats.kept += 1;
        input.kept += 1;
        if (stats.kept >= maxGames) {
          break outer;
        }
      }
      if (report.endedMidGame) {
        warnings.push(`${label} ended in the middle of a game: the stream was cut short (a truncated file, or the program feeding it died)`);
      }
    }
    if (options.minGamesRead && stats.read < options.minGamesRead) {
      throw new Error(`read only ${stats.read} games, below --min-games-read ${options.minGamesRead}: the input is incomplete, no book written`);
    }
    const months = options.months ?? [];
    const expected = profile === "lichess" && months.length > 0 && maxGames === Infinity ? months.length * EXPECTED_LICHESS_GAMES_PER_MONTH : 0;
    if (expected && stats.read < expected * SANITY_FRACTION) {
      warnings.push(
        `read ${stats.read} games for ${months.length} month(s); a Lichess month has about ${EXPECTED_LICHESS_GAMES_PER_MONTH}. ` +
          "The input may be incomplete; use --min-games-read to make this an error",
      );
    }
    const theory = selectTheory(store.merged(), rule);
    peakRss = Math.max(peakRss, process.memoryUsage().rss, process.resourceUsage().maxRSS * 1024);
    const raw = encodeBook(theory.entries, { maxPly: options.maxPly });
    const gz = gzipSync(raw, { level: 9 });
    const manifest = {
      version: options.version,
      format: FORMAT_VERSION,
      file: `opening-book-v${options.version}.bin.gz`,
      profile,
      builtAt: options.buildDate ?? new Date().toISOString(),
      months,
      files: options.files ?? [],
      games: stats.kept,
      gamesRead: stats.read,
      duplicates: stats.duplicates,
      // Per input file: with several overlapping collections (Lumbra, AJ-OTB, Chess-Results) the
      // duplicates of a file are the games an earlier file already supplied.
      inputs: perInput,
      minElo,
      ...(profile === "lichess" ? { speeds: LOCAL_BOOK_BUILD.speeds } : {}),
      maxPly: options.maxPly,
      thresholds: {
        minPositionGames: rule.minPositionGames,
        minMoveGames: rule.minMoveGames,
        minMoveShare: rule.minMoveShare,
        ...(track ? { minDistinctPlayers } : {}),
      },
      positions: theory.positions,
      moves: theory.entries.length,
      bytes: raw.length,
      gzipBytes: gz.length,
      sha256: createHash("sha256").update(gz).digest("hex"),
      // Free-text terms of the input data (docs/opening-book.md, "Licenses and attribution").
      ...(options.license ? { license: options.license } : {}),
      ...(options.attribution ? { attribution: options.attribution } : {}),
    };
    return {
      raw,
      gz,
      manifest,
      warnings,
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

/** Text of src/chess/opening-book-manifest.ts for a built (or merged) manifest. */
export function appManifestSource(manifest) {
  return (
    "// SIG-1226: the DEPLOYED local opening book. Written by\n" +
    "// scripts/opening-book/build-book.mjs / union-books.mjs --app-manifest; `version` is part of the\n" +
    "// review cache key, `file` is the versioned object under /book/ (R2 key book/<file>). The app\n" +
    "// reads only those two; `sources` documents what the file was merged from.\n" +
    `export const OPENING_BOOK_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;\n`
  );
}

/** Writes the book, its manifest and (optionally) the app manifest. Only called after a successful build. */
export function writeOutputs(result, { outDir, version, appManifest }) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, result.manifest.file), result.gz);
  writeFileSync(join(outDir, `opening-book-v${version}.manifest.json`), `${JSON.stringify(result.manifest, null, 2)}\n`);
  if (appManifest) {
    writeFileSync(appManifest, appManifestSource(result.manifest));
  }
}

/** The whole command: returns the result, writes files only when the build succeeded. */
export async function run(argv, deps = {}) {
  const args = parseArgs(argv);
  const months = args.months ?? args.inputs.map((name) => /(\d{4}-\d{2})/.exec(basename(name))?.[1]).filter(Boolean);
  for (const name of args.inputs) {
    if (name !== "-" && !existsSync(name)) {
      throw new Error(`input not found: ${name}`);
    }
  }
  const sources = args.inputs.map((name) => openLines(name, deps));
  const sourceNames = args.inputs.map((name) => (name === "-" ? "stdin" : basename(name)));
  const result = await buildBook(sources, { ...args, months, files: args.inputs.filter((name) => name !== "-").map((name) => basename(name)), sourceNames });
  writeOutputs(result, args);
  for (const warning of result.warnings) {
    console.error(`warning: ${warning}`);
  }
  return result;
}

async function main() {
  const result = await run(process.argv.slice(2));
  console.log(JSON.stringify({ ...result.manifest, stats: result.stats }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`error: ${error.message}`);
    process.exit(1);
  });
}
