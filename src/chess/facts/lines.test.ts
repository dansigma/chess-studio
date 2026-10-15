import assert from "node:assert/strict";
import test from "node:test";
import { computePositionFacts } from "./index.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MIDDLEGAME = "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21";

test("starting position has no open files, 7th-rank pieces or long-diagonal control", () => {
  const facts = computePositionFacts(START);
  assert.deepEqual(facts.files, []);
  assert.deepEqual(facts.seventhRank, []);
  assert.deepEqual(facts.diagonals, []);
});

test("open and half-open files, with the heavy pieces on them", () => {
  const facts = computePositionFacts(MIDDLEGAME);
  const byFile = Object.fromEntries(facts.files.map((f) => [f.file, f]));
  assert.equal(byFile.d?.openness, "open");
  assert.deepEqual(byFile.d?.heavyPieces, ["d1", "d8"]);
  assert.equal(byFile.a?.openness, "open");
  assert.equal(byFile.b?.openness, "open");
  assert.equal(byFile.c?.openness, "half-open");
  assert.equal(byFile.c?.halfOpenFor, "w");
  assert.deepEqual(byFile.c?.heavyPieces, ["c8"]);
  assert.equal(byFile.e, undefined);
});

test("a file with pawns of one side only is half-open for the other side", () => {
  const facts = computePositionFacts("4k3/4p3/8/8/8/8/8/4K3 w - - 0 1");
  const file = facts.files.find((f) => f.file === "e");
  assert.equal(file?.openness, "half-open");
  assert.equal(file?.halfOpenFor, "w");
});

test("rook on the seventh counted from its own side", () => {
  const facts = computePositionFacts(MIDDLEGAME);
  assert.deepEqual(facts.seventhRank, [{ color: "w", squares: ["a7"] }]);
  const black = computePositionFacts("4k3/8/8/8/8/8/1r6/4K3 w - - 0 1");
  assert.deepEqual(black.seventhRank, [{ color: "b", squares: ["b2"] }]);
});

test("long diagonals: sole controller and contested", () => {
  const facts = computePositionFacts(MIDDLEGAME);
  const main = facts.diagonals.find((d) => d.diagonal === "a1h8");
  assert.deepEqual(main, { diagonal: "a1h8", controller: "w", pieces: ["b2"] });
  const other = facts.diagonals.find((d) => d.diagonal === "h1a8");
  assert.equal(other?.controller, null);
  assert.deepEqual(other?.pieces.sort(), ["d5", "g2"]);
});

test("a bishop blocked by its own pawn does not control the diagonal", () => {
  const facts = computePositionFacts("4k3/8/8/8/3P4/8/1B6/4K3 w - - 0 1");
  assert.deepEqual(facts.diagonals, []);
});

test("a piece on the long diagonal is not in control when the path to a center is blocked", () => {
  const blocked = computePositionFacts("7k/8/8/4P3/8/8/1B6/K7 w - - 0 1");
  assert.equal(blocked.diagonals.find((d) => d.diagonal === "a1h8"), undefined);
  const open = computePositionFacts("7k/8/8/8/8/8/1B6/K7 w - - 0 1");
  assert.equal(open.diagonals.find((d) => d.diagonal === "a1h8")?.controller, "w");
});
