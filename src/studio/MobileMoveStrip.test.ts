import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { importPgn } from "@/src/chess/pgn.ts";
import { goEnd } from "@/src/chess/tree.ts";
import { mobileStripModel } from "./MobileMoveStrip.tsx";

const SHORT_GAME = `[Event "Smoke"]
[Site "e2e"]
[White "White"]
[Black "Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0`;

describe("mobile strip model (SIG-1043)", () => {
  test("lists mainline SANs with per-ply paths", () => {
    const { tree } = importPgn(SHORT_GAME);
    const { moves, currentIndex } = mobileStripModel(tree, []);
    assert.deepEqual(
      moves.map((move) => move.san),
      ["e4", "e5", "Nf3"],
    );
    assert.deepEqual(
      moves.map((move) => move.path),
      [[0], [0, 0], [0, 0, 0]],
    );
    assert.equal(currentIndex, -1);
  });

  test("tracks the current index along the mainline", () => {
    const { tree } = importPgn(SHORT_GAME);
    assert.equal(mobileStripModel(tree, [0]).currentIndex, 0);
    assert.equal(mobileStripModel(tree, [0, 0]).currentIndex, 1);
    assert.equal(mobileStripModel(tree, goEnd(tree, [])).currentIndex, 2);
  });

  test("clamps a variation path to the shared mainline prefix", () => {
    const { tree } = importPgn(`${SHORT_GAME}\n\n1. e4 c5 2. Nf3`);
    // [0, 1, ...] diverges at ply 2 — highlight stays on the shared prefix.
    assert.equal(mobileStripModel(tree, [0, 1, 0]).currentIndex, 0);
  });

  test("is empty for the start position with no moves", () => {
    const { tree } = importPgn(`[Result "*"]\n\n*`);
    const { moves, currentIndex } = mobileStripModel(tree, []);
    assert.deepEqual(moves, []);
    assert.equal(currentIndex, -1);
  });
});
