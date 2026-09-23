import assert from "node:assert/strict";
import test from "node:test";
import { fenToCopy, publishVisibleFen } from "./copy-board.ts";

test("copy uses the position on screen", () => {
  publishVisibleFen("8/8/8/8/8/8/8/4K2k w - - 0 1");
  assert.equal(fenToCopy("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), "8/8/8/8/8/8/8/4K2k w - - 0 1");
  publishVisibleFen(null);
});

test("copy falls back to the active board when no board is published", () => {
  publishVisibleFen(null);
  assert.equal(fenToCopy("  rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1  "), "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
});

test("copy rejects an empty position", () => {
  publishVisibleFen("   ");
  assert.throws(() => fenToCopy("  "), /No position/);
  publishVisibleFen(null);
});
