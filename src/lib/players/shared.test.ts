import assert from "node:assert/strict";
import test from "node:test";
import { isSource, playerResult, safeQuery } from "./shared.ts";

test("playerResult maps win/loss/draw for a given color", () => {
  assert.equal(playerResult("white", "white"), "win");
  assert.equal(playerResult("white", "black"), "loss");
  assert.equal(playerResult("black", "black"), "win");
  assert.equal(playerResult("black", "white"), "loss");
  assert.equal(playerResult("draw", "white"), "draw");
  assert.equal(playerResult(null, "white"), null);
});

test("safeQuery strips filter punctuation and trims to 48 characters", () => {
  assert.equal(safeQuery("  magnus  "), "magnus");
  assert.equal(safeQuery("a%b_c,d(e)f\"g"), "a b c d e f g");
  assert.equal(safeQuery("x".repeat(60)).length, 48);
});

test("isSource accepts only the three known providers", () => {
  assert.equal(isSource("lichess"), true);
  assert.equal(isSource("chesscom"), true);
  assert.equal(isSource("studio"), true);
  assert.equal(isSource("fide"), false);
  assert.equal(isSource(""), false);
});
