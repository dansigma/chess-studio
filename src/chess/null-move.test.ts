import assert from "node:assert/strict";
import test from "node:test";
import { applyNullMoveFen, isNullMoveToken } from "./null-move.ts";

test("null-move tokens are recognized", () => {
  assert.equal(isNullMoveToken("--"), true);
  assert.equal(isNullMoveToken("Z0"), true);
  assert.equal(isNullMoveToken("0000"), true);
  assert.equal(isNullMoveToken("  --  "), true);
  assert.equal(isNullMoveToken("e4"), false);
  assert.equal(isNullMoveToken(""), false);
});

test("applyNullMoveFen flips the side, clears ep, bumps clocks", () => {
  const next = applyNullMoveFen(
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  );
  assert.equal(next, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2");
});

test("applyNullMoveFen keeps the move number on white to move", () => {
  const next = applyNullMoveFen(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  );
  assert.equal(next, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 1 1");
});

test("applyNullMoveFen rejects a FEN without a board", () => {
  assert.throws(() => applyNullMoveFen(""), /Invalid FEN/);
});
