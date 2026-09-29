import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { PUZZLE_CATALOG } from "./catalog.ts";
import {
  applyResult,
  compilePuzzle,
  dailyPuzzle,
  emptyProgress,
  fenAtPly,
  judgeMove,
  levelFromXp,
  materialFor,
  PUZZLES,
  puzzlePoints,
  rankedPuzzles,
  rate,
} from "./engine.ts";
import { puzzleGoal, solvedPraise, squareAnchor } from "./feedback.ts";
import { THEME_CARDS, type PuzzleTheme } from "./types.ts";

test("every puzzle is a legal line that ends with the solver", () => {
  assert.equal(PUZZLES.length, PUZZLE_CATALOG.length);
  const ids = new Set<string>();
  for (const puzzle of PUZZLES) {
    assert.equal(ids.has(puzzle.id), false, puzzle.id);
    ids.add(puzzle.id);
    assert.equal(puzzle.uci.length % 2, 1, puzzle.id);
    const end = new Chess(puzzle.endFen);
    const solver = new Chess(puzzle.fen).turn();
    if (puzzle.themes.includes("mate")) {
      assert.equal(end.isCheckmate(), true, puzzle.id);
    } else {
      assert.ok(materialFor(puzzle.endFen, solver) > materialFor(puzzle.fen, solver), puzzle.id);
    }
    if (puzzle.themes.includes("mateIn1")) {
      assert.equal(puzzle.uci.length, 1, puzzle.id);
    }
    if (puzzle.themes.includes("mateIn2")) {
      assert.equal(puzzle.uci.length, 3, puzzle.id);
    }
  }
});

test("theme cards each have a puzzle", () => {
  for (const card of THEME_CARDS) {
    assert.ok(
      PUZZLES.some((puzzle) => puzzle.themes.includes(card.id)),
      card.id,
    );
  }
});

test("a matching move is accepted and a different legal move is refused", () => {
  const puzzle = compilePuzzle(PUZZLE_CATALOG[0]);
  const from = puzzle.uci[0].slice(0, 2);
  const to = puzzle.uci[0].slice(2, 4);
  const correct = judgeMove(puzzle.fen, puzzle.uci[0], from, to);
  assert.equal(correct.kind, "correct");
  const wrong = judgeMove(puzzle.fen, puzzle.uci[0], "g1", "h1");
  assert.equal(wrong.kind, "wrong");
  assert.equal(judgeMove(puzzle.fen, puzzle.uci[0], "a1", "a3").kind, "illegal");
});

test("fenAtPly walks the solution", () => {
  const puzzle = PUZZLES.find((item) => item.id === "double-rook-back-rank");
  assert.ok(puzzle);
  assert.equal(fenAtPly(puzzle.fen, puzzle.uci, 0), new Chess(puzzle.fen).fen());
  assert.equal(fenAtPly(puzzle.fen, puzzle.uci, puzzle.uci.length), puzzle.endFen);
});

test("equal ratings move by 16 points", () => {
  assert.equal(rate(1200, 1200, true), 1216);
  assert.equal(rate(1200, 1200, false), 1184);
});

test("ranked puzzles prefer the closest unseen rating", () => {
  const ranked = rankedPuzzles(PUZZLES, 1220, new Set(["knight-fork-queen"]));
  assert.equal(ranked[0]?.id, "knight-fork-queen-d7");
  assert.equal(ranked.some((puzzle) => puzzle.id === "knight-fork-queen"), false);
});

test("rated success updates rating and streak", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  const next = applyResult(emptyProgress(), {
    id: "queen-corridor",
    mode: "rated",
    success: true,
    puzzleRating: 1200,
    sessionScore: 1,
    now,
  });
  assert.equal(next.rating, 1216);
  assert.equal(next.solved, 1);
  assert.equal(next.streak, 1);
  assert.equal(next.history[0]?.delta, 16);
  assert.equal(next.xp, puzzlePoints(1200, 1));
  const missed = applyResult(next, {
    id: "back-rank-rook",
    mode: "rated",
    success: false,
    puzzleRating: 1200,
    sessionScore: 1,
    now,
  });
  assert.equal(missed.streak, 0);
  assert.equal(missed.bestStreak, 1);
  assert.equal(missed.failed, 1);
});

test("the daily puzzle is stable and counts once", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  const later = new Date(2026, 8, 28, 18).getTime();
  assert.equal(dailyPuzzle(PUZZLES, now).id, dailyPuzzle(PUZZLES, later).id);
  const once = applyResult(emptyProgress(), {
    id: "queen-corridor",
    mode: "daily",
    success: true,
    puzzleRating: 750,
    sessionScore: 1,
    now,
  });
  const twice = applyResult(once, {
    id: "queen-corridor",
    mode: "daily",
    success: true,
    puzzleRating: 750,
    sessionScore: 1,
    now: later,
  });
  assert.equal(twice.solved, 1);
  assert.equal(twice.rating, 1200);
  assert.equal(twice.daily, "2026-09-28");
});

test("rush keeps the best score and leaves the rating alone", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  const next = applyResult(emptyProgress(), {
    id: "rook-roll",
    mode: "rush",
    success: true,
    puzzleRating: 880,
    sessionScore: 4,
    now,
  });
  assert.equal(next.rating, 1200);
  assert.equal(next.rushBest, 4);
  assert.equal(next.streak, 0);
});

test("puzzle points grow with the streak and levels every 100 xp", () => {
  assert.ok(puzzlePoints(800, 3) > puzzlePoints(800, 1));
  assert.deepEqual(levelFromXp(0), { level: 1, into: 0, span: 100 });
  assert.deepEqual(levelFromXp(100), { level: 2, into: 0, span: 100 });
  assert.equal(levelFromXp(140).into, 40);
});

test("a failed puzzle does not award points", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  const missed = applyResult(emptyProgress(), {
    id: "back-rank-rook",
    mode: "rated",
    success: false,
    puzzleRating: 800,
    sessionScore: 0,
    now,
  });
  assert.equal(missed.xp, 0);
});

test("coach lines and the award anchor follow the side to move", () => {
  assert.match(puzzleGoal(["mateIn1", "mate"]), /Mate in one/);
  assert.match(solvedPraise(3), /1-2-3/);
  const white = squareAnchor("a1", "white");
  const black = squareAnchor("a1", "black");
  assert.ok(white && black);
  assert.ok(white.y > 0.8);
  assert.ok(black.y < 0.2);
  assert.equal(squareAnchor("z9", "white"), null);
});

test("theme filters are real puzzle themes", () => {
  const theme: PuzzleTheme = "fork";
  const ranked = rankedPuzzles(PUZZLES, 1200, new Set(), theme);
  assert.ok(ranked.length >= 2);
  assert.ok(ranked.every((puzzle) => puzzle.themes.includes(theme)));
});
