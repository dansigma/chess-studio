import assert from "node:assert/strict";
import test from "node:test";
import { decodeCountsBook, encodeCountsBook } from "./opening-book-counts-format.ts";
import { encodeMove } from "./opening-book-format.ts";

const entries = [
  { key: -1n, move: encodeMove("a7a8q"), count: 40, total: 100 },
  { key: 0n, move: encodeMove("e2e4"), count: 200, total: 500 },
  { key: 0n, move: encodeMove("d2d4"), count: 250, total: 500 },
];

test("round trips counts and sorts moves by descending games", () => {
  const book = decodeCountsBook(encodeCountsBook(entries, { maxPly: 40 }));
  assert.equal(book.maxPly, 40);
  assert.equal(book.keyCount, 2);
  assert.equal(book.entryCount, 3);
  assert.deepEqual(book.positionFor(0n), {
    total: 500,
    moves: [{ uci: "d2d4", games: 250 }, { uci: "e2e4", games: 200 }],
  });
  assert.deepEqual(book.positionFor(-1n), { total: 100, moves: [{ uci: "a7a8q", games: 40 }] });
  assert.equal(book.positionFor(8n), null);
});

test("rejects truncated files and bad magic", () => {
  const bytes = encodeCountsBook(entries, { maxPly: 40 });
  for (let end = 0; end < bytes.length; end += 1) {
    assert.throws(() => decodeCountsBook(bytes.subarray(0, end)), /truncated/);
  }
  bytes[0] = 0;
  assert.throws(() => decodeCountsBook(bytes), /bad magic/);
});
