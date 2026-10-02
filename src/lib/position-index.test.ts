import assert from "node:assert/strict";
import test from "node:test";
import { importPgn } from "../chess/pgn.ts";
import { rowsForTree, visitGameTree } from "./position-index.ts";

test("sibling sidelines get their own ply (no shared counter)", () => {
  const { tree } = importPgn(`[Event "Test"]

1. e4 (1. d4 d5) 1... e5 2. Nf3`);
  const plies = new Map<string, number>();
  visitGameTree(tree, (event) => {
    if (event.type === "move") {
      plies.set(event.san, event.ply);
    }
  });
  assert.equal(plies.get("e4"), 1);
  assert.equal(plies.get("e5"), 2);
  assert.equal(plies.get("Nf3"), 3);
  assert.equal(plies.get("d4"), 1);
  assert.equal(plies.get("d5"), 2);
});

test("rowsForTree gives every row a unique seq and ply may repeat across branches", () => {
  const { tree } = importPgn(`[Event "Test"]

1. e4 (1. d4 d5) 1... e5`);
  const { positions } = rowsForTree(tree, "g1", "white");
  const seqs = positions.map((row) => row.seq);
  assert.equal(new Set(seqs).size, positions.length);
  assert.equal(positions[0].seq, 1);
  const plies = positions.map((row) => row.ply);
  assert.ok(new Set(plies).size < plies.length);
});

test("nested sidelines restart ply from their own parent", () => {
  const { tree } = importPgn(`[Event "Test"]

1. e4 (1. d4 (1. c4 c5)) 1... e5`);
  const plies = new Map<string, number>();
  visitGameTree(tree, (event) => {
    if (event.type === "move") {
      plies.set(event.san, event.ply);
    }
  });
  assert.equal(plies.get("e4"), 1);
  assert.equal(plies.get("d4"), 1);
  assert.equal(plies.get("c4"), 1);
  assert.equal(plies.get("c5"), 2);
  assert.equal(plies.get("e5"), 2);
});
