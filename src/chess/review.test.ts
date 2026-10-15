import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { MISS_BEST_WIN_CHANCE, MISS_OPPONENT_LOSS, MISS_OWN_LOSS, accuracyPercent, bookFlags, countLabels, gradeMove, hangsPiece, hangsPieceOn, isSacrifice, isSacrificeOn, lineHolds, mergeBookLabel, winChance, type PositionScore } from "./review.ts";

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

test("per-move accuracy stays in range", () => {
  assert.ok(accuracyPercent(20, 20) <= 100);
  assert.ok(accuracyPercent(1000, -1000) >= 0);
});

test("book never overrides brilliant, great, or best", () => {
  assert.equal(mergeBookLabel(true, "brilliant"), "brilliant");
  assert.equal(mergeBookLabel(true, "great"), "great");
  assert.equal(mergeBookLabel(true, "best"), "best");
  assert.equal(mergeBookLabel(true, "veryGood"), "book");
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
  assert.equal(hangsPieceOn(before, after, "f6g4", "b"), true);
  assert.equal(isSacrificeOn(before, after, "b"), false);
  const sacBefore = new Chess("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const sacAfter = new Chess("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1");
  assert.equal(isSacrificeOn(sacBefore, sacAfter, "w"), true);
  assert.equal(isSacrifice("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1", "w"), true);
});

test("a non-best move losing at most 2 win-chance points is very good", () => {
  const graded = gradeMove({ side: "w", playedUci: "d2d4", before: score(0.3, "e2e4"), afterWhitePawns: 0.25, sacrifice: false });
  assert.equal(graded.label, "veryGood");
  assert.ok(graded.winLoss <= 2);
});

test("a non-best move losing between 2 and 5 win-chance points is decent", () => {
  // 0 -> -0.3 pawns is about 2.7 win-chance points.
  const graded = gradeMove({ side: "w", playedUci: "d2d4", before: score(0, "e2e4"), afterWhitePawns: -0.3, sacrifice: false });
  assert.ok(graded.winLoss > 2 && graded.winLoss <= 5);
  assert.equal(graded.label, "decent");
});

test("the negative thresholds are unchanged", () => {
  const cases: Array<[number, number, string]> = [
    [0, -1.1, "inaccuracy"],
    [0.2, -1.2, "mistake"],
    [0.2, -3, "blunder"],
  ];
  for (const [before, after, label] of cases) {
    assert.equal(gradeMove({ side: "w", playedUci: "a2a3", before: score(before, "e2e4"), afterWhitePawns: after, sacrifice: false }).label, label);
  }
});

test("golden game: existing labels keep their grades and counts", () => {
  const moves = [
    { side: "w", played: "e2e4", before: score(0.3, "e2e4", 0.2), after: 0.3, expected: "best" },
    { side: "b", played: "e7e5", before: score(-0.3, "e7e5", -0.35), after: -0.3, expected: "best" },
    { side: "w", played: "f1c4", before: score(0.3, "g1f3", 0.2), after: 0.25, expected: "veryGood" },
    { side: "b", played: "d8h4", before: score(-0.25, "g8f6", -0.4), after: 2.5, expected: "blunder" },
    { side: "w", played: "b1c3", before: score(0.9, "g2g3", 0.1), after: -0.4, expected: "mistake" },
    { side: "b", played: "g8f6", before: score(-0.4, "g8f6", 1), after: -0.4, expected: "great" },
  ] as const;
  const labels = moves.map((move) =>
    gradeMove({ side: move.side, playedUci: move.played, before: move.before, afterWhitePawns: move.after, sacrifice: false }).label,
  );
  assert.deepEqual(labels, moves.map((move) => move.expected));
  const counts = countLabels(labels);
  assert.equal(counts.best, 2);
  assert.equal(counts.blunder, 1);
  assert.equal(counts.mistake, 1);
  assert.equal(counts.great, 1);
  assert.equal(counts.veryGood, 1);
});

test("miss: squandering an advantage handed over by the opponent's error", () => {
  assert.equal(MISS_OPPONENT_LOSS, 10);
  assert.equal(MISS_BEST_WIN_CHANCE, 70);
  assert.equal(MISS_OWN_LOSS, 10);
  // Best here is +3.0 (about 75% win chance); the played move throws it back to +0.8.
  const input = { side: "w", playedUci: "a2a3", before: score(3, "d1h5"), afterWhitePawns: 0.8, sacrifice: false } as const;
  assert.equal(gradeMove({ ...input, opponentLastLoss: 15 }).label, "miss");
  // Without an opponent error it is only a mistake.
  assert.equal(gradeMove(input).label, "mistake");
  assert.equal(gradeMove({ ...input, opponentLastLoss: 9 }).label, "mistake");
  // The opponent threshold is inclusive.
  assert.equal(gradeMove({ ...input, opponentLastLoss: MISS_OPPONENT_LOSS }).label, "miss");
});

test("miss needs the best move to reach 70% win chance", () => {
  // +1.0 is about 59% win chance, so the same drop is a mistake, not a miss.
  const graded = gradeMove({ side: "w", playedUci: "a2a3", before: score(1, "d1h5"), afterWhitePawns: -0.5, sacrifice: false, opponentLastLoss: 20 });
  assert.equal(graded.label, "mistake");
});

test("blunder keeps precedence over miss", () => {
  const graded = gradeMove({ side: "w", playedUci: "a2a3", before: score(3, "d1h5"), afterWhitePawns: -4, sacrifice: false, opponentLastLoss: 30 });
  assert.equal(graded.label, "blunder");
});

test("miss never applies to the engine's best move", () => {
  const graded = gradeMove({ side: "w", playedUci: "d1h5", before: score(3, "d1h5"), afterWhitePawns: 0.8, sacrifice: false, opponentLastLoss: 30 });
  assert.notEqual(graded.label, "miss");
});

test("a move that leaves the mover clearly worse is never very good or decent", () => {
  // -8.0 -> -8.1 pawns barely moves win chance, but the side is already lost.
  const lost = gradeMove({ side: "w", playedUci: "a2a3", before: score(-8, "e2e4"), afterWhitePawns: -8.1, sacrifice: false });
  assert.equal(lost.label, null);
  const lostDecent = gradeMove({ side: "b", playedUci: "a7a6", before: score(8, "e7e5"), afterWhitePawns: 8.3, sacrifice: false });
  assert.equal(lostDecent.label, null);
  // The same tiny loss from a level position stays "very good".
  const level = gradeMove({ side: "w", playedUci: "a2a3", before: score(0, "e2e4"), afterWhitePawns: -0.05, sacrifice: false });
  assert.equal(level.label, "veryGood");
});
