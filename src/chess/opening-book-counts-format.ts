import { decodeMove, HEADER_BYTES, unsignedKey, type BookEntry, type EncodeOptions } from "./opening-book-format.ts";

// The theory book's 16-byte header with independent magic and version.
// Each position stores a key delta (unsigned LEB128), total (LEB128), and
// move count (u8), followed by ascending (u16 LE move code, LEB128 games) pairs.
const MAGIC = "XDOC";
export const COUNTS_FORMAT_VERSION = 1;
const MAX_COUNT = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_KEY = (1n << 64n) - 1n;

export type CountsEntry = BookEntry & { count: number; total: number };
export type CountsPosition = { total: number; moves: { uci: string; games: number }[] };
export type CountsBook = {
  maxPly: number;
  keyCount: number;
  entryCount: number;
  positionFor(key: bigint): CountsPosition | null;
};

export function encodeCountsBook(entries: readonly CountsEntry[], { maxPly }: EncodeOptions): Uint8Array {
  if (!Number.isInteger(maxPly) || maxPly < 1 || maxPly > 255) {
    throw new Error("maxPly must be an integer from 1 to 255");
  }
  const sorted = entries.map((entry) => ({ ...entry, key: unsignedKey(entry.key) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.move - b.move));
  const body: number[] = [];
  function writeVarint(value: bigint) {
    while (value >= 128n) {
      body.push(Number(value & 127n) | 128);
      value >>= 7n;
    }
    body.push(Number(value));
  }

  let previous = 0n;
  let positions = 0;
  for (let start = 0; start < sorted.length;) {
    const { key, total } = sorted[start];
    if (!Number.isSafeInteger(total) || total <= 0) {
      throw new Error("invalid counts book position total");
    }
    let end = start + 1;
    while (end < sorted.length && sorted[end].key === key) {
      end += 1;
    }
    if (end - start > 255) {
      throw new Error("more than 255 moves for one position");
    }
    writeVarint(key - previous);
    writeVarint(BigInt(total));
    body.push(end - start);
    let previousMove = -1;
    let remaining = total;
    for (let i = start; i < end; i += 1) {
      const entry = sorted[i];
      const { move, count } = entry;
      if (!Number.isInteger(move) || move <= previousMove || move > 0x4fff) {
        throw new Error("invalid or duplicate counts book move code");
      }
      if (entry.total !== total || !Number.isSafeInteger(count) || count <= 0 || count > remaining) {
        throw new Error("invalid counts book move count");
      }
      body.push(move & 255, move >> 8);
      writeVarint(BigInt(count));
      remaining -= count;
      previousMove = move;
    }
    previous = key;
    positions += 1;
    start = end;
  }

  const bytes = new Uint8Array(HEADER_BYTES + body.length);
  const view = new DataView(bytes.buffer);
  bytes.set(Array.from(MAGIC, (char) => char.charCodeAt(0)));
  bytes[4] = COUNTS_FORMAT_VERSION;
  bytes[5] = maxPly;
  view.setUint32(8, positions, true);
  view.setUint32(12, sorted.length, true);
  bytes.set(body, HEADER_BYTES);
  return bytes;
}

export function decodeCountsBook(bytes: Uint8Array): CountsBook {
  const truncated = () => new Error("opening book counts are truncated");
  if (bytes.length < HEADER_BYTES) {
    throw truncated();
  }
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== MAGIC) {
    throw new Error("not an opening book counts file (bad magic)");
  }
  if (bytes[4] !== COUNTS_FORMAT_VERSION) {
    throw new Error(`unsupported opening book counts format ${bytes[4]}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const maxPly = bytes[5];
  const keyCount = view.getUint32(8, true);
  const entryCount = view.getUint32(12, true);
  if (HEADER_BYTES + 3 * keyCount + 3 * entryCount > bytes.length) {
    throw truncated();
  }
  const keys = new BigUint64Array(keyCount);
  const starts = new Uint32Array(keyCount + 1);
  const totals = new Float64Array(keyCount);
  const codes = new Uint16Array(entryCount);
  const games = new Float64Array(entryCount);
  let offset = HEADER_BYTES;

  function readByte() {
    if (offset >= bytes.length) {
      throw truncated();
    }
    return bytes[offset++];
  }

  function readVarint(max: bigint) {
    let value = 0n;
    for (let shift = 0n; shift <= 63n; shift += 7n) {
      const byte = readByte();
      value |= BigInt(byte & 127) << shift;
      if (value > max) {
        break;
      }
      if (byte < 128) {
        return value;
      }
    }
    throw new Error("opening book counts are corrupt (invalid varint)");
  }

  let key = 0n;
  let filled = 0;
  for (let i = 0; i < keyCount; i += 1) {
    const delta = readVarint(MAX_KEY - key);
    if (i > 0 && delta === 0n) {
      throw new Error("opening book counts are corrupt (duplicate key)");
    }
    key += delta;
    keys[i] = key;
    starts[i] = filled;
    const total = Number(readVarint(MAX_COUNT));
    totals[i] = total;
    const moveCount = readByte();
    if (moveCount === 0 || filled + moveCount > entryCount) {
      throw new Error("opening book counts are corrupt (invalid move count)");
    }
    let previousMove = -1;
    let remaining = total;
    for (let m = 0; m < moveCount; m += 1) {
      const code = readByte() | (readByte() << 8);
      const count = Number(readVarint(BigInt(remaining)));
      if (code <= previousMove || code > 0x4fff || count === 0) {
        throw new Error("opening book counts are corrupt (invalid move)");
      }
      codes[filled] = code;
      games[filled] = count;
      filled += 1;
      previousMove = code;
      remaining -= count;
    }
  }
  starts[keyCount] = filled;
  if (filled !== entryCount || offset !== bytes.length) {
    throw new Error("opening book counts are corrupt (length mismatch)");
  }

  return {
    maxPly,
    keyCount,
    entryCount,
    positionFor(key) {
      const target = unsignedKey(key);
      let low = 0;
      let high = keyCount - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (keys[mid] === target) {
          const moves = Array.from(codes.subarray(starts[mid], starts[mid + 1]), (code, index) => ({
            uci: decodeMove(code),
            games: games[starts[mid] + index],
          }));
          return { total: totals[mid], moves: moves.sort((a, b) => b.games - a.games) };
        }
        if (keys[mid] < target) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return null;
    },
  };
}
