import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { importPgn } from "@/src/chess/pgn";
import type { LiveGame } from "@/src/lib/live/types";
import { clockAtPath, compactGridShape, MAX_LIVE_BOARDS, mainlineLength, pliesPlayed, reconcileNotation, resolveViewPath } from "./live-board-model";

function position(sans: string[]): { fen: string; lastMoveUci: string | null } {
  const chess = new Chess();
  let lastMoveUci: string | null = null;
  for (const san of sans) {
    const m = chess.move(san);
    lastMoveUci = `${m.from}${m.to}${m.promotion ?? ""}`;
  }
  return { fen: chess.fen(), lastMoveUci };
}
function gameAfter(sans: string[]): LiveGame {
  const p = { name: "x", title: null, rating: null, fed: null, fideId: null, clockMs: null };
  return { id: "a", roundId: "R", white: p, black: p, ...position(sans), result: "*", thinkTimeSec: null, pgn: null, updatedAt: 0 };
}
const treeOf = (movetext: string) => importPgn(`[Event "x"]\n\n${movetext} *`).tree;

describe("reconcileNotation", () => {
  it("no tree yet: stale", () => {
    assert.deepEqual(reconcileNotation(null, gameAfter(["e4"])), { tree: null, stale: true });
  });
  it("same length: the same tree object", () => {
    const tree = treeOf("1. e4 e5");
    const r = reconcileNotation(tree, gameAfter(["e4", "e5"]));
    assert.equal(r.tree, tree);
    assert.equal(r.stale, false);
  });
  it("one ply ahead: appends lastMove locally", () => {
    const tree = treeOf("1. e4 e5");
    const r = reconcileNotation(tree, gameAfter(["e4", "e5", "Nf3"]));
    assert.equal(r.stale, false);
    assert.equal(mainlineLength(r.tree!), 3);
    assert.equal(mainlineLength(tree), 2, "the input is not mutated");
  });
  it("more than one ply ahead: stale", () => {
    const r = reconcileNotation(treeOf("1. e4"), gameAfter(["e4", "e5", "Nf3"]));
    assert.equal(r.stale, true);
  });
  it("a last move that does not lead to the FEN: stale", () => {
    const game = { ...gameAfter(["e4", "e5", "Nf3"]), lastMoveUci: "d2d4" };
    assert.equal(reconcileNotation(treeOf("1. e4 e5"), game).stale, true);
  });
  it("pliesPlayed", () => {
    assert.equal(pliesPlayed(gameAfter([]).fen), 0);
    assert.equal(pliesPlayed(gameAfter(["e4", "e5", "Nf3"]).fen), 3);
  });
});

describe("clockAtPath", () => {
  const tree = treeOf("1. e4 {[%clk 0:09:50]} e5 {[%clk 0:09:45]} 2. Nf3 {[%clk 0:09:40]}");
  it("the latest clock of the side at or before the ply", () => {
    assert.equal(clockAtPath(tree, [0, 0, 0], "white"), 580_000);
    assert.equal(clockAtPath(tree, [0, 0, 0], "black"), 585_000);
    assert.equal(clockAtPath(tree, [0, 0], "white"), 590_000);
    assert.equal(clockAtPath(tree, [0], "black"), null);
    assert.equal(clockAtPath(tree, [], "white"), null);
  });
  it("a PGN without clocks has none", () => {
    assert.equal(clockAtPath(treeOf("1. e4 e5"), [0, 0], "white"), null);
  });
});

describe("resolveViewPath", () => {
  const tree = treeOf("1. e4 e5");
  it("null follows; a vanished path follows", () => {
    assert.equal(resolveViewPath(tree, null), null);
    assert.deepEqual(resolveViewPath(tree, [0]), [0]);
    assert.equal(resolveViewPath(tree, [0, 0, 0]), null);
  });
});

describe("compactGridShape", () => {
  it("2x2 up to four boards, 3x2 for five and six; one board takes the pane, two sit side by side", () => {
    assert.deepEqual(compactGridShape(1), { cols: 1, rows: 1 });
    assert.deepEqual(compactGridShape(2), { cols: 2, rows: 1 });
    assert.deepEqual(compactGridShape(3), { cols: 2, rows: 2 });
    assert.deepEqual(compactGridShape(4), { cols: 2, rows: 2 });
    assert.deepEqual(compactGridShape(5), { cols: 3, rows: 2 });
    assert.deepEqual(compactGridShape(6), { cols: 3, rows: 2 });
  });
  it("never needs more than two rows at the board cap", () => {
    for (let n = 1; n <= MAX_LIVE_BOARDS; n += 1) {
      assert.ok(compactGridShape(n).rows <= 2);
    }
  });
});
