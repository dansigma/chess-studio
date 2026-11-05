// scripts/opening-book/union-books.mjs
// SIG-1229: merge several built books into the one file the app reads.
//
//   node scripts/opening-book/union-books.mjs out-lichess/opening-book-v3.bin.gz \
//     out-masters/opening-book-v3.bin.gz out-corr/opening-book-v3.bin.gz \
//     --out-dir out --version 3 --app-manifest src/chess/opening-book-manifest.ts
//
// A (position, move) pair is in the output if it is theory in ANY input; each
// input was already filtered by its own profile, thresholds and player rule.
// The binary format is unchanged, so the app needs no change. Each input needs
// its manifest next to it (opening-book-vN.manifest.json for opening-book-vN.bin.gz);
// the merged manifest keeps the fields the app reads (version, file) and lists
// every input under `sources` with its own stats.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import {
  BOOK_MAGIC,
  FORMAT_VERSION,
  HEADER_BYTES,
  encodeBook,
} from "../../src/chess/opening-book-format.ts";
import { writeOutputs } from "./build-book.mjs";

const USAGE =
  "usage: node scripts/opening-book/union-books.mjs <book.bin.gz> <book.bin.gz> ... --out-dir DIR --version N [--app-manifest PATH] [--build-date ISO]";
const U64 = (1n << 64n) - 1n;

/**
 * Every { key, moves } group of a decoded (not gzipped) book, in file order.
 * Parses the documented layout directly: the app's decoder only needs lookups.
 */
export function* iterateBook(bytes) {
  if (bytes.length < HEADER_BYTES || String.fromCharCode(...bytes.subarray(0, 4)) !== BOOK_MAGIC) {
    throw new Error("not an opening book (bad magic)");
  }
  if (bytes[4] !== FORMAT_VERSION) {
    throw new Error(`unsupported opening book format ${bytes[4]}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const keyCount = view.getUint32(8, true);
  let offset = HEADER_BYTES;
  let previous = 0n;
  for (let k = 0; k < keyCount; k += 1) {
    let delta = 0n;
    let shift = 0n;
    for (;;) {
      if (offset >= bytes.length || shift > 63n) {
        throw new Error("opening book is truncated");
      }
      const byte = bytes[offset];
      offset += 1;
      delta |= BigInt(byte & 0x7f) << shift;
      shift += 7n;
      if ((byte & 0x80) === 0) {
        break;
      }
    }
    previous = (previous + delta) & U64;
    const count = bytes[offset];
    offset += 1;
    const moves = [];
    for (let m = 0; m < count; m += 1) {
      moves.push(bytes[offset] | (bytes[offset + 1] << 8));
      offset += 2;
    }
    yield { key: previous, moves };
  }
  if (offset !== bytes.length) {
    throw new Error("opening book is corrupt (length mismatch)");
  }
}

/** Merges decoded books; returns the pairs, the largest ply cap and, per input, how many pairs only it has. */
export function unionPairs(books) {
  const seen = new Map();
  const perBook = books.map(() => 0);
  books.forEach((bytes, index) => {
    for (const { key, moves } of iterateBook(bytes)) {
      for (const move of moves) {
        const id = `${key}:${move}`;
        const owners = seen.get(id);
        if (owners) {
          owners.add(index);
        } else {
          seen.set(id, new Set([index]));
        }
        perBook[index] += 1;
      }
    }
  });
  const pairs = [];
  const unique = books.map(() => 0);
  for (const [id, owners] of seen) {
    const [key, move] = id.split(":");
    pairs.push({ key: BigInt(key), move: Number(move) });
    if (owners.size === 1) {
      unique[[...owners][0]] += 1;
    }
  }
  return { pairs, unique, perBook };
}

/**
 * Builds the union of `inputs` ({ raw: Uint8Array, manifest }). `now` stamps the
 * merged manifest. Throws when an input is not a book of this format.
 */
export function unionBooks(inputs, { version, buildDate }) {
  if (inputs.length < 2) {
    throw new Error("a union needs at least two books");
  }
  const { pairs, unique } = unionPairs(inputs.map((input) => input.raw));
  const maxPly = Math.max(...inputs.map((input) => input.raw[5]));
  const raw = encodeBook(pairs, { maxPly });
  const gz = gzipSync(raw, { level: 9 });
  const keys = new Set(pairs.map((pair) => pair.key));
  const sum = (field) => inputs.reduce((total, input) => total + (input.manifest[field] ?? 0), 0);
  const manifest = {
    version,
    format: FORMAT_VERSION,
    file: `opening-book-v${version}.bin.gz`,
    profile: "union",
    builtAt: buildDate ?? new Date().toISOString(),
    months: [...new Set(inputs.flatMap((input) => input.manifest.months ?? []))].sort(),
    games: sum("games"),
    gamesRead: sum("gamesRead"),
    duplicates: sum("duplicates"),
    maxPly,
    positions: keys.size,
    moves: pairs.length,
    bytes: raw.length,
    gzipBytes: gz.length,
    sha256: createHash("sha256").update(gz).digest("hex"),
    licenses: [...new Set(inputs.map((input) => input.manifest.license).filter(Boolean))],
    sources: inputs.map((input, index) => ({ ...input.manifest, profile: input.manifest.profile ?? "lichess", uniqueMoves: unique[index] })),
  };
  return { raw, gz, manifest, stats: { inputs: inputs.length, uniquePerInput: unique } };
}

export function manifestPathFor(bookPath) {
  return bookPath.replace(/\.bin\.gz$/, ".manifest.json");
}

export function loadInput(path) {
  const manifestPath = manifestPathFor(path);
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest not found next to the book: ${manifestPath}`);
  }
  return { raw: new Uint8Array(gunzipSync(readFileSync(path))), manifest: JSON.parse(readFileSync(manifestPath, "utf8")) };
}

export function parseUnionArgs(argv) {
  const args = { inputs: [], outDir: null, version: null, appManifest: null, buildDate: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--out-dir" || token === "--app-manifest" || token === "--build-date") {
      if (argv[i + 1] === undefined) {
        throw new Error(`${USAGE}\n${token} needs a value`);
      }
      args[{ "--out-dir": "outDir", "--app-manifest": "appManifest", "--build-date": "buildDate" }[token]] = argv[i + 1];
      i += 1;
    } else if (token === "--version") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${USAGE}\n--version must be a positive integer`);
      }
      args.version = value;
      i += 1;
    } else if (token.startsWith("--")) {
      throw new Error(USAGE);
    } else {
      args.inputs.push(token);
    }
  }
  if (args.inputs.length < 2 || !args.outDir || !args.version) {
    throw new Error(USAGE);
  }
  return args;
}

export function runUnion(argv) {
  const args = parseUnionArgs(argv);
  const result = unionBooks(args.inputs.map(loadInput), args);
  writeOutputs(result, args);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const result = runUnion(process.argv.slice(2));
    console.log(JSON.stringify({ ...result.manifest, stats: result.stats }, null, 2));
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}
