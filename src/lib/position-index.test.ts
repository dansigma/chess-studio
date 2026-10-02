import assert from "node:assert/strict";
import test from "node:test";
import { importPgn } from "../chess/pgn.ts";
import { visitGameTree } from "./position-index.ts";

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
