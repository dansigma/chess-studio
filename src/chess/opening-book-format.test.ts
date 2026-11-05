// SIG-1226: round trips and lookups for the local opening book binary format.
import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  BOOK_MAGIC,
  HEADER_BYTES,
  decodeBook,
  decodeMove,
  encodeBook,
  encodeMove,
} from "./opening-book-format.ts";

test("move codes round trip for plain moves, castling squares and promotions", () => {
  for (const uci of ["e2e4", "a1h8", "h8a1", "e1g1", "e7e8q", "a2a1n", "b7b8r", "g2h1b"]) {
    const code = encodeMove(uci);
    assert.ok(code >= 0 && code <= 0x7fff, uci);
    assert.equal(decodeMove(code), uci);
  }
  assert.equal(encodeMove("e2e9"), -1);
  assert.equal(encodeMove("e2e4x"), -1);
  assert.equal(encodeMove("(none)"), -1);
});

test("header carries magic, version, ply cap and counts", () => {
  const bytes = encodeBook([{ key: 5n, move: encodeMove("e2e4") }], { maxPly: 40 });
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), BOOK_MAGIC);
  assert.equal(bytes[4], 1);
  assert.equal(bytes[5], 40);
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(8, true), 1);
  assert.equal(view.getUint32(12, true), 1);
  assert.equal(bytes.length, HEADER_BYTES + 1 + 1 + 2);
});

test("round trip: keys across the full unsigned 64-bit range, several moves per key, any input order", () => {
  const keys = [0n, 1n, 127n, 128n, 2n ** 32n, 2n ** 63n - 1n, 2n ** 63n, 2n ** 64n - 2n, 2n ** 64n - 1n];
  const moves = ["e2e4", "d2d4", "g1f3", "c2c4", "e7e8q"].map(encodeMove);
  const entries: Array<{ key: bigint; move: number }> = [];
  keys.forEach((key, i) => {
    for (let m = 0; m <= i % moves.length; m += 1) {
      entries.push({ key, move: moves[m] });
    }
  });
  const shuffled = [...entries].reverse();
  shuffled.push(entries[0]); // duplicate pairs collapse
  const book = decodeBook(encodeBook(shuffled, { maxPly: 24 }));
  assert.equal(book.maxPly, 24);
  assert.equal(book.keyCount, keys.length);
  assert.equal(book.entryCount, entries.length);
  keys.forEach((key, i) => {
    const expected = moves.slice(0, (i % moves.length) + 1).map(decodeMove).sort();
    assert.deepEqual([...book.movesFor(key)].sort(), expected, String(key));
    for (const uci of expected) {
      assert.equal(book.hasMove(key, uci), true);
    }
    assert.equal(book.hasMove(key, "a2a3"), false);
  });
  assert.equal(book.hasMove(2n, "e2e4"), false, "absent key");
});

test("signed keys (as produced by positionKey) match their unsigned form", () => {
  const signed = BigInt.asIntN(64, 0xfedcba9876543210n);
  assert.ok(signed < 0n);
  const book = decodeBook(encodeBook([{ key: signed, move: encodeMove("e2e4") }], { maxPly: 40 }));
  assert.equal(book.hasMove(signed, "e2e4"), true);
  assert.equal(book.hasMove(BigInt.asUintN(64, signed), "e2e4"), true);
});

test("an empty book decodes and answers nothing", () => {
  const book = decodeBook(encodeBook([], { maxPly: 40 }));
  assert.equal(book.keyCount, 0);
  assert.equal(book.hasMove(1n, "e2e4"), false);
});

test("lookups on a few thousand pseudo-random keys agree with a Set", () => {
  let seed = 7n;
  const next = () => {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return seed;
  };
  const pairs = new Set<string>();
  const entries: Array<{ key: bigint; move: number }> = [];
  for (let i = 0; i < 3000; i += 1) {
    const key = next();
    const move = encodeMove(["e2e4", "d2d4", "g1f3"][i % 3]);
    entries.push({ key, move });
    pairs.add(`${key}:${decodeMove(move)}`);
  }
  const book = decodeBook(gunzipSync(gzipSync(encodeBook(entries, { maxPly: 40 }))));
  for (const { key, move } of entries) {
    assert.equal(book.hasMove(key, decodeMove(move)), true);
  }
  for (let i = 0; i < 2000; i += 1) {
    const key = next();
    for (const uci of ["e2e4", "d2d4", "g1f3"]) {
      assert.equal(book.hasMove(key, uci), pairs.has(`${key}:${uci}`));
    }
  }
});

test("bad input is rejected", () => {
  const good = encodeBook([{ key: 9n, move: encodeMove("e2e4") }], { maxPly: 40 });
  assert.throws(() => decodeBook(good.subarray(0, 8)), /truncated/);
  const badMagic = good.slice();
  badMagic[0] = 0x59;
  assert.throws(() => decodeBook(badMagic), /magic/);
  const badVersion = good.slice();
  badVersion[4] = 9;
  assert.throws(() => decodeBook(badVersion), /format/);
  assert.throws(() => decodeBook(good.subarray(0, good.length - 1)), /truncated/);
  assert.throws(() => decodeBook(new Uint8Array([...good, 0])), /corrupt/);
  assert.throws(() => encodeBook([], { maxPly: 0 }), /maxPly/);
  assert.throws(() => encodeBook([{ key: 1n, move: -1 }], { maxPly: 40 }), /move code/);
});
