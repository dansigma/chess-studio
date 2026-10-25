// scripts/lichess-puzzles/build-subset.mjs
// SIG-1042: build a curated, balanced subset of the Lichess puzzle database
// (CC0, https://database.lichess.org/#puzzles) in this app's puzzle format.
//
//   node scripts/lichess-puzzles/build-subset.mjs <input.csv> <output.csv> [--size 60000] [--seed 1042]
//
// The Lichess CSV has columns
// PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
// where FEN is the position BEFORE the opponent's move and Moves is a
// space-separated UCI list whose first move is the opponent's. The app's
// format (src/puzzles/types.ts, src/puzzles/engine.ts compilePuzzle) instead
// stores the solver-to-move FEN with an odd-length SAN line, so this script
// applies the first UCI move to the FEN and converts the rest to SAN.
// Rows with illegal moves, even-length remaining lines, unmapped themes, or
// below-threshold popularity/plays are dropped; survivors are balanced by
// 100-point rating band and theme with a deterministic seed and written as a
// \copy-ready CSV with Postgres array literals:
//   \copy public.puzzles(id,fen,moves,rating,themes,popularity,nb_plays) from '…' csv header

import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import { mapThemes } from "./map-themes.mjs";

const POPULARITY_MIN = 85;
const NB_PLAYS_MIN = 500;
const DEFAULT_SIZE = 60000;
const DEFAULT_SEED = 1042;
const RATING_BAND = 100;

function usage() {
  return "usage: node scripts/lichess-puzzles/build-subset.mjs <input.csv> <output.csv> [--size N] [--seed N]";
}

export function parseArgs(argv) {
  const args = { input: null, output: null, size: DEFAULT_SIZE, seed: DEFAULT_SEED };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--size" || token === "--seed") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${usage()}\n${token} must be a positive integer`);
      }
      if (token === "--size") {
        args.size = value;
      } else {
        args.seed = value;
      }
      i += 1;
    } else if (token === "--help" || token === "-h") {
      throw new Error(usage());
    } else {
      rest.push(token);
    }
  }
  if (rest.length !== 2) {
    throw new Error(usage());
  }
  args.input = rest[0];
  args.output = rest[1];
  return args;
}

// Minimal CSV splitter for the Lichess format: fields never contain newlines;
// GameUrl/OpeningTags may be quoted. Handles RFC-4180 "" escapes.
export function splitCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseUciMove(chess, uci) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    throw new Error(`bad UCI ${uci}`);
  }
  return chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.slice(4) || undefined,
  });
}

/**
 * Convert one Lichess row to the app format. Returns the converted puzzle or
 * null when the row must be skipped (filters, illegal/even lines, no mapped
 * theme). Throws nothing.
 */
export function convertRow(record) {
  const popularity = Number(record.Popularity);
  if (!Number.isFinite(popularity) || popularity < POPULARITY_MIN) {
    return null;
  }
  const nbPlays = Number(record.NbPlays);
  if (!Number.isFinite(nbPlays) || nbPlays < NB_PLAYS_MIN) {
    return null;
  }
  const themes = mapThemes((record.Themes ?? "").split(" ").filter(Boolean));
  if (themes.length === 0) {
    return null;
  }
  const rating = Number(record.Rating);
  if (!Number.isFinite(rating)) {
    return null;
  }
  const tokens = (record.Moves ?? "").split(" ").filter(Boolean);
  if (tokens.length < 2) {
    return null;
  }
  let chess;
  try {
    chess = new Chess(record.FEN);
  } catch {
    return null;
  }
  try {
    // chess.js v1 throws on illegal moves, so reaching the end means legal.
    parseUciMove(chess, tokens[0]);
    if (chess.isCheck()) {
      // Solver to move must not start in check (mirrors compilePuzzle).
      return null;
    }
    const solverFen = chess.fen();
    const sans = [];
    for (const uci of tokens.slice(1)) {
      sans.push(parseUciMove(chess, uci).san);
    }
    if (sans.length === 0 || sans.length % 2 === 0) {
      return null;
    }
    return {
      id: record.PuzzleId,
      fen: solverFen,
      moves: sans,
      rating,
      themes,
      popularity,
      nbPlays,
    };
  } catch {
    return null;
  }
}

function mulberry32(a) {
  let s = a >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(arr, seed) {
  const result = [...arr];
  const rng = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

/**
 * Balance candidates by 100-point rating band and theme with a deterministic
 * seed: per-(band, theme) pools fill round-robin over a seeded shuffle
 * until `size` is reached; leftover quota redistributes to the largest
 * remaining pools. Pure function over converted rows.
 */
export function balanceSubset(candidates, size, seed) {
  if (candidates.length <= size) {
    return shuffleWithSeed(candidates, seed);
  }
  const byKey = new Map();
  for (const candidate of candidates) {
    const band = Math.floor(candidate.rating / RATING_BAND) * RATING_BAND;
    for (const theme of candidate.themes) {
      const key = `${band}:${theme}`;
      const pool = byKey.get(key);
      if (pool) {
        pool.members.push(candidate);
      } else {
        byKey.set(key, { members: [candidate], taken: 0, picked: 0 });
      }
    }
  }
  const pools = shuffleWithSeed(
    [...byKey.values()].map((pool) => ({ ...pool, members: shuffleWithSeed(pool.members, seed) })),
    seed,
  );
  const picked = [];
  const pickedIds = new Set();
  let quota = Math.max(1, Math.floor(size / pools.length));
  while (picked.length < size) {
    let progressed = false;
    for (const pool of pools) {
      while (picked.length < size && pool.picked < quota && pool.taken < pool.members.length) {
        const candidate = pool.members[pool.taken];
        pool.taken += 1;
        if (pickedIds.has(candidate.id)) {
          continue;
        }
        pickedIds.add(candidate.id);
        pool.picked += 1;
        picked.push(candidate);
        progressed = true;
      }
    }
    if (picked.length >= size) {
      break;
    }
    // No pool could take more under this quota but members remain:
    // grant every pool another round.
    if (!progressed) {
      const remaining = pools.some((pool) => pool.taken < pool.members.length);
      if (!remaining) {
        break;
      }
      quota += 1;
    }
  }
  return shuffleWithSeed(picked, seed);
}

/** Escape one Postgres text[] element inside a {"…","…"} literal. */
export function pgTextElement(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function pgTextArray(values) {
  return `{${values.map(pgTextElement).join(",")}}`;
}

function csvField(value) {
  return /[",\n{}]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toOutputRow(puzzle) {
  return [
    puzzle.id,
    puzzle.fen,
    pgTextArray(puzzle.moves),
    String(puzzle.rating),
    pgTextArray(puzzle.themes),
    String(puzzle.popularity),
    String(puzzle.nbPlays),
  ].map(csvField).join(",");
}

export const OUTPUT_HEADER = "id,fen,moves,rating,themes,popularity,nb_plays";

export async function buildSubset(inputPath, outputPath, size, seed) {
  const reader = createInterface({ input: createReadStream(inputPath), crlfDelay: Infinity });
  let header = null;
  const candidates = [];
  for await (const line of reader) {
    if (line === "") {
      continue;
    }
    const fields = splitCsvLine(line);
    if (header === null) {
      header = fields;
      continue;
    }
    const record = Object.fromEntries(header.map((name, i) => [name, fields[i] ?? ""]));
    const converted = convertRow(record);
    if (converted) {
      candidates.push(converted);
    }
  }
  if (header === null) {
    throw new Error("empty input CSV");
  }
  for (const name of ["PuzzleId", "FEN", "Moves", "Rating", "Popularity", "NbPlays", "Themes"]) {
    if (!header.includes(name)) {
      throw new Error(`input CSV is missing column ${name}`);
    }
  }
  const picked = balanceSubset(candidates, size, seed);
  const writer = createWriteStream(outputPath, "utf8");
  writer.write(`${OUTPUT_HEADER}\n`);
  for (const puzzle of picked) {
    writer.write(`${toOutputRow(puzzle)}\n`);
  }
  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
    writer.end();
  });
  return { candidates: candidates.length, picked: picked.length };
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(String(err.message || err));
    process.exit(2);
  }
  buildSubset(args.input, args.output, args.size, args.seed).then(
    ({ candidates, picked }) => {
      console.log(`converted ${candidates} puzzles, wrote ${picked} to ${args.output}`);
    },
    (err) => {
      console.error(`build-subset: ${err.message}`);
      process.exit(1);
    },
  );
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedAsScript) {
  main(process.argv.slice(2));
}
