import assert from "node:assert/strict";
import test from "node:test";
import { pgnFilename } from "./pgn-filename.ts";

test("pgnFilename strips hostile characters and appends .pgn once", () => {
  assert.equal(pgnFilename('a/b\\c:d*e?f"g<h>i|j', "board"), "abcdefghij.pgn");
  assert.equal(pgnFilename("Kasparov vs Topalov", "board"), "Kasparov vs Topalov.pgn");
  assert.equal(pgnFilename("game.pgn", "board"), "game.pgn");
});

test("pgnFilename preserves case-insensitive .PGN extension without doubling", () => {
  assert.equal(pgnFilename("Opening.PGN", "board"), "Opening.PGN");
  assert.equal(pgnFilename("Opening.Pgn", "board"), "Opening.Pgn");
});

test("pgnFilename falls back when empty, whitespace-only, or all hostile characters", () => {
  assert.equal(pgnFilename("", "Board"), "Board.pgn");
  assert.equal(pgnFilename("   ", "Board.pgn"), "Board.pgn");
  assert.equal(pgnFilename("///", "database"), "database.pgn");
});

test("pgnFilename collapses the double space left by a removed separator", () => {
  assert.equal(pgnFilename("Carlsen / Nepo: Game 1", "board"), "Carlsen Nepo Game 1.pgn");
});
