import assert from "node:assert/strict";
import test from "node:test";
import type { BoardMarks } from "@/src/chess/marks";
import { importPgn } from "@/src/chess/pgn";
import { flattenMainLine } from "@/src/chess/tree";
import { linePositions, setMarksOnMainlineMove } from "./line-marks.ts";

const marks: BoardMarks = {
  squares: [{ color: "G", square: "e4" }],
  arrows: [{ color: "R", from: "e2", to: "e4" }],
};

const commented =
  '[Event "Caro"]\n[White "Author"]\n\n1. e4 {King pawn} e5 {Symmetric} 2. Nf3 *';

test("linePositions walks the mainline, never the side variations", () => {
  const tree = importPgn("1. e4 (1. d4 d5) e5 2. Nf3").tree;
  const positions = linePositions(tree);
  assert.deepEqual(
    positions.map((position) => position.san),
    [null, "e4", "e5", "Nf3"],
  );
  assert.equal(positions[0]?.fen, tree.startFen);
  assert.equal(positions[3]?.fen, flattenMainLine(tree)[2]?.fen);
});

test("setMarksOnMainlineMove stores the marks on the selected move", () => {
  const next = setMarksOnMainlineMove(commented, 1, marks);
  const reimported = importPgn(next);
  const moves = flattenMainLine(reimported.tree);
  assert.deepEqual(moves[0]?.marks, marks);
  assert.equal(moves[1]?.marks, undefined);
  // The existing comment text and the headers survive the round-trip.
  assert.equal(moves[0]?.comment, "King pawn");
  assert.equal(moves[1]?.comment, "Symmetric");
  assert.equal(reimported.headers.Event, "Caro");
  assert.equal(reimported.headers.White, "Author");
});

test("setMarksOnMainlineMove writes the [%cal]/[%csl] tokens into the PGN", () => {
  const next = setMarksOnMainlineMove("1. e4 e5", 2, marks);
  assert.match(next, /\[%csl Ge4\]/);
  assert.match(next, /\[%cal Re2e4\]/);
});

test("setting undefined clears the marks but keeps the comment", () => {
  const withMarks = setMarksOnMainlineMove(commented, 1, marks);
  const cleared = setMarksOnMainlineMove(withMarks, 1, undefined);
  const moves = flattenMainLine(importPgn(cleared).tree);
  assert.equal(moves[0]?.marks, undefined);
  assert.equal(moves[0]?.comment, "King pawn");
  assert.doesNotMatch(cleared, /\[%csl/);
  assert.doesNotMatch(cleared, /\[%cal/);
});

test("marks on the starting position round-trip through the game comment", () => {
  const next = setMarksOnMainlineMove(commented, 0, marks);
  const reimported = importPgn(next);
  assert.deepEqual(reimported.tree.startMarks, marks);
  assert.equal(reimported.tree.startComment, undefined);
  assert.equal(flattenMainLine(reimported.tree)[0]?.comment, "King pawn");
});

test("an out-of-range ply leaves the PGN untouched", () => {
  assert.equal(setMarksOnMainlineMove(commented, 4, marks), commented);
  assert.equal(setMarksOnMainlineMove(commented, -1, marks), commented);
});

test("side variations survive the rewrite", () => {
  const pgn = "1. e4 (1. d4 d5) e5 (2. Nf3 Nc6) 2. Nc3";
  const next = setMarksOnMainlineMove(pgn, 1, marks);
  assert.match(next, /\(1\. d4 d5\)/);
  assert.deepEqual(flattenMainLine(importPgn(next).tree)[0]?.marks, marks);
});
