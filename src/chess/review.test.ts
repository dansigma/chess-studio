import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { accuracyPercent, bookFlags, gradeMove, hangsPiece, hangsPieceOn, harmonicAccuracy, isSacrifice, isSacrificeOn, lineHolds, mergeBookLabel, winChance, type PositionScore } from "./review.ts";

function score(whitePawns: number, bestUci: string, secondWhitePawns: number | null = null): PositionScore {
  return { whitePawns, bestUci, secondWhitePawns };
}

test("win chance is about 50 from an equal position", () => {
  assert.ok(Math.abs(winChance(0) - 50) < 0.01);
});

test("the engine move with no loss is best", () => {
  const graded = gradeMove({
    side: "w",
    playedUci: "e2e4",
    before: score(0.3, "e2e4", 0.1),
    afterWhitePawns: 0.28,
    sacrifice: false,
  });
  assert.equal(graded.label, "best");
  assert.ok(graded.accuracy > 95);
});

test("a large drop with a better alternative is a blunder", () => {
  const graded = gradeMove({
    side: "w",
    playedUci: "a2a3",
    before: score(0.2, "e2e4"),
    afterWhitePawns: -3,
    sacrifice: false,
  });
  assert.equal(graded.label, "blunder");
});

test("a small drop is an inaccuracy only when another move is clearly better", () => {
  const graded = gradeMove({
    side: "w",
    playedUci: "a2a3",
    before: score(0, "e2e4"),
    afterWhitePawns: -1.1,
    sacrifice: false,
  });
  assert.equal(graded.label, "inaccuracy");
});

test("the same eval on a different move is not a blunder", () => {
  const graded = gradeMove({
    side: "w",
    playedUci: "d2d4",
    before: score(0.3, "e2e4"),
    afterWhitePawns: 0.25,
    sacrifice: false,
  });
  assert.notEqual(graded.label, "blunder");
  assert.ok((graded.accuracy ?? 0) > 90);
});

test("a knight capture that stays en prise is a hanging sacrifice", () => {
  const before = "rnbqkb1r/pppppp1p/5n2/8/6P1/7P/PPPPPP2/RNBQKBNR b KQkq - 0 3";
  const after = "rnbqkb1r/pppppp1p/8/8/6n1/7P/PPPPPP2/RNBQKBNR w KQkq - 0 4";
  assert.equal(hangsPiece(before, after, "f6g4", "b"), true);
});

test("a played line within 30cp of the best line still holds", () => {
  assert.equal(lineHolds("w", 1.2, 1), true);
  assert.equal(lineHolds("w", 1.2, 0.5), false);
});

test("a best move in a lost position is not brilliant", () => {
  const graded = gradeMove({
    side: "w",
    playedUci: "h7f7",
    before: score(-5.2, "h7f7", -8),
    afterWhitePawns: -5.2,
    sacrifice: true,
  });
  assert.equal(graded.label, "best");
});

test("the best move is brilliant only when the other move is clearly worse", () => {
  const brilliant = gradeMove({
    side: "b",
    playedUci: "f6g4",
    before: score(-2, "f6g4", 1),
    afterWhitePawns: -2,
    sacrifice: true,
  });
  const ordinary = gradeMove({
    side: "w",
    playedUci: "d2d4",
    before: score(0.4, "d2d4", 0.2),
    afterWhitePawns: 0.4,
    sacrifice: true,
  });
  assert.equal(brilliant.label, "brilliant");
  assert.equal(ordinary.label, "best");
});

test("the engine's best move is never a mistake, even when the next eval drops", () => {
  const graded = gradeMove({
    side: "w",
    playedUci: "e2e4",
    before: score(2, "e2e4", -1),
    afterWhitePawns: -1,
    sacrifice: true,
  });
  assert.equal(graded.label, "brilliant");
});

test("book continues only while each played move is still a reply", () => {
  const flags = bookFlags(["e2e4", "e7e5", "a2a3"], [["e2e4", "d2d4"], ["e7e5"], ["e2e4"]]);
  assert.deepEqual(flags, [true, true, false]);
  assert.deepEqual(bookFlags(["a2a3"], [["e2e4"]]), [false]);
  assert.deepEqual(bookFlags(["e2e4"], [null]), [false]);
});

test("accuracy stays in range and the harmonic mean punishes a bad move", () => {
  assert.ok(accuracyPercent(20, 20) <= 100);
  assert.equal(harmonicAccuracy([]), null);
  assert.ok((harmonicAccuracy([100, 100, 20]) ?? 100) < 50);
});

test("book never overrides brilliant, great, or best", () => {
  assert.equal(mergeBookLabel(true, "brilliant"), "brilliant");
  assert.equal(mergeBookLabel(true, "great"), "great");
  assert.equal(mergeBookLabel(true, "best"), "best");
  assert.equal(mergeBookLabel(true, "interesting"), "book");
  assert.equal(mergeBookLabel(true, null), "book");
  assert.equal(mergeBookLabel(false, "mistake"), "mistake");
});

test("the board-based checks match the fen wrappers", () => {
  const fenBefore = "rnbqkb1r/pppppp1p/5n2/8/6P1/7P/PPPPPP2/RNBQKBNR b KQkq - 0 3";
  const fenAfter = "rnbqkb1r/pppppp1p/8/8/6n1/7P/PPPPPP2/RNBQKBNR w KQkq - 0 4";
  const before = new Chess(fenBefore);
  const after = new Chess(fenAfter);
  assert.equal(hangsPieceOn(before, after, "f6g4", "b"), hangsPiece(fenBefore, fenAfter, "f6g4", "b"));
  assert.equal(isSacrificeOn(before, after, "b"), isSacrifice(fenBefore, fenAfter, "b"));
});
