// SIG-1226: compact binary format of the local opening book (built offline by
// scripts/opening-book/build-book.mjs, read in the browser by decodeBook).
// Dependency-free so the Node script and the browser share one implementation.
//
// The file holds only THEORY: (position key, move) pairs that passed BOOK_RULE
// (position >= 100 games, move >= 20 games and >= 3%) over the filtered Lichess
// games. Position key = the app's 64-bit position hash (src/chess/zobrist.ts),
// as an UNSIGNED 64-bit integer. Membership is exact (no Bloom filter).
//
// Layout (all integers little-endian):
//
//   header, 16 bytes
//     0   4  magic "XDOB"
//     4   1  format version (FORMAT_VERSION)
//     5   1  maxPly: plies covered; moves are stored for positions at ply 0..maxPly-1
//     6   2  reserved, 0
//     8   4  keyCount: distinct positions
//     12  4  entryCount: (position, move) pairs
//   body, keyCount groups sorted by ascending unsigned key
//     varint  key minus the previous key (LEB128, up to 10 bytes; the first is the key itself)
//     u8      moveCount (1..255)
//     u16     move code x moveCount, ascending
//
//   move code (15 bits) = from | to << 6 | promotion << 12, squares 0..63 as
//   file + 8 * rank (a1 = 0), promotion 0 none, 1 n, 2 b, 3 r, 4 q.
//
// The file is shipped gzip-compressed (the client inflates it with
// DecompressionStream). Lookup is a binary search over the decoded keys.

export const BOOK_MAGIC = "XDOB";
export const FORMAT_VERSION = 1;
export const HEADER_BYTES = 16;
const U64 = (1n << 64n) - 1n;
const PROMOTIONS = ["", "n", "b", "r", "q"];

export type BookEntry = { key: bigint; move: number };

/** Move code of a UCI move, or -1 if it is not a plain UCI move. */
export function encodeMove(uci: string): number {
  if (!/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(uci)) {
    return -1;
  }
  const from = uci.charCodeAt(0) - 97 + 8 * (uci.charCodeAt(1) - 49);
  const to = uci.charCodeAt(2) - 97 + 8 * (uci.charCodeAt(3) - 49);
  const promotion = uci.length === 5 ? PROMOTIONS.indexOf(uci[4]) : 0;
  return from | (to << 6) | (promotion << 12);
}

export function decodeMove(code: number): string {
  const square = (index: number) => String.fromCharCode(97 + (index % 8)) + String.fromCharCode(49 + Math.floor(index / 8));
  return square(code & 63) + square((code >> 6) & 63) + PROMOTIONS[code >> 12];
}

/** Unsigned form of a (possibly signed) 64-bit key. */
export function unsignedKey(key: bigint): bigint {
  return BigInt.asUintN(64, key);
}

export type EncodeOptions = { maxPly: number };

export function encodeBook(entries: ReadonlyArray<BookEntry>, options: EncodeOptions): Uint8Array {
  if (!Number.isInteger(options.maxPly) || options.maxPly < 1 || options.maxPly > 255) {
    throw new Error("maxPly must be an integer from 1 to 255");
  }
  const sorted = entries
    .map((entry) => {
      if (!Number.isInteger(entry.move) || entry.move < 0 || entry.move > 0x7fff) {
        throw new Error(`invalid move code ${entry.move}`);
      }
      return { key: unsignedKey(entry.key), move: entry.move };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.move - b.move));
  const groups: Array<{ key: bigint; moves: number[] }> = [];
  let pairs = 0;
  for (const entry of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.key === entry.key) {
      if (last.moves[last.moves.length - 1] === entry.move) {
        continue; // duplicate pair
      }
      if (last.moves.length === 255) {
        throw new Error("more than 255 moves for one position");
      }
      last.moves.push(entry.move);
    } else {
      groups.push({ key: entry.key, moves: [entry.move] });
    }
    pairs += 1;
  }
  const body: number[] = [];
  let previous = 0n;
  for (const group of groups) {
    let delta = group.key - previous;
    previous = group.key;
    do {
      const low = Number(delta & 0x7fn);
      delta >>= 7n;
      body.push(delta > 0n ? low | 0x80 : low);
    } while (delta > 0n);
    body.push(group.moves.length);
    for (const move of group.moves) {
      body.push(move & 0xff, move >> 8);
    }
  }
  const out = new Uint8Array(HEADER_BYTES + body.length);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i += 1) {
    out[i] = BOOK_MAGIC.charCodeAt(i);
  }
  out[4] = FORMAT_VERSION;
  out[5] = options.maxPly;
  view.setUint32(8, groups.length, true);
  view.setUint32(12, pairs, true);
  out.set(body, HEADER_BYTES);
  return out;
}

export type OpeningBook = {
  maxPly: number;
  keyCount: number;
  entryCount: number;
  /** True when `uci` is a theory move from the position with this key (signed or unsigned). */
  hasMove(key: bigint, uci: string): boolean;
  /** All theory moves (UCI) from the position, for tests and tooling. */
  movesFor(key: bigint): string[];
};

export function decodeBook(bytes: Uint8Array): OpeningBook {
  if (bytes.length < HEADER_BYTES) {
    throw new Error("opening book is truncated");
  }
  for (let i = 0; i < 4; i += 1) {
    if (bytes[i] !== BOOK_MAGIC.charCodeAt(i)) {
      throw new Error("not an opening book (bad magic)");
    }
  }
  if (bytes[4] !== FORMAT_VERSION) {
    throw new Error(`unsupported opening book format ${bytes[4]}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const maxPly = bytes[5];
  const keyCount = view.getUint32(8, true);
  const entryCount = view.getUint32(12, true);
  const keys = new BigUint64Array(keyCount);
  const start = new Uint32Array(keyCount + 1);
  const moves = new Uint16Array(entryCount);
  let offset = HEADER_BYTES;
  let previous = 0n;
  let filled = 0;
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
    keys[k] = previous;
    if (offset >= bytes.length) {
      throw new Error("opening book is truncated");
    }
    const count = bytes[offset];
    offset += 1;
    if (filled + count > entryCount || offset + 2 * count > bytes.length) {
      throw new Error("opening book is truncated");
    }
    start[k] = filled;
    for (let m = 0; m < count; m += 1) {
      moves[filled] = bytes[offset] | (bytes[offset + 1] << 8);
      filled += 1;
      offset += 2;
    }
  }
  start[keyCount] = filled;
  if (filled !== entryCount || offset !== bytes.length) {
    throw new Error("opening book is corrupt (length mismatch)");
  }

  function find(key: bigint): number {
    const target = unsignedKey(key);
    let low = 0;
    let high = keyCount - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const value = keys[mid];
      if (value === target) {
        return mid;
      }
      if (value < target) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return -1;
  }

  return {
    maxPly,
    keyCount,
    entryCount,
    hasMove(key, uci) {
      const code = encodeMove(uci);
      const index = code < 0 ? -1 : find(key);
      if (index < 0) {
        return false;
      }
      for (let i = start[index]; i < start[index + 1]; i += 1) {
        if (moves[i] === code) {
          return true;
        }
      }
      return false;
    },
    movesFor(key) {
      const index = find(key);
      if (index < 0) {
        return [];
      }
      return Array.from(moves.subarray(start[index], start[index + 1]), decodeMove);
    },
  };
}
