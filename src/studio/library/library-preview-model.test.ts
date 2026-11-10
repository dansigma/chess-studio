import { test } from "node:test";
import assert from "node:assert/strict";
import { importPgn } from "@/src/chess/pgn";
import { START_FEN } from "@/src/chess/tree";
import { mainLineMoveCount, startPathForPosition } from "./library-preview-model";

const tree = importPgn("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *").tree;

test("no position filter opens on the start position", () => {
  assert.deepEqual(startPathForPosition(tree, null), []);
});

test("start ply is the main-line ply matching the filter position (clocks ignored)", () => {
  const afterNf3 = tree.children[0]!.children[0]!.children[0]!.fen;
  assert.deepEqual(startPathForPosition(tree, afterNf3), [0, 0, 0]);
  const changedClocks = afterNf3.split(" ").slice(0, 4).join(" ") + " 9 40";
  assert.deepEqual(startPathForPosition(tree, changedClocks), [0, 0, 0]);
  assert.deepEqual(startPathForPosition(tree, START_FEN), []);
});

test("a position that is not in the game falls back to the start", () => {
  const other = importPgn("1. d4 d5 *").tree.children[0]!.fen;
  assert.deepEqual(startPathForPosition(tree, other), []);
});

test("main-line move count", () => {
  assert.equal(mainLineMoveCount(tree), 3);
  assert.equal(mainLineMoveCount(importPgn("1. e4 *").tree), 1);
});
