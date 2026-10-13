import assert from "node:assert/strict";
import test from "node:test";
import { MARK_HEX } from "@/src/chess/marks";
import { PUZZLE_CATALOG } from "./catalog.ts";
import { compilePuzzle, type CompiledPuzzle } from "./engine.ts";
import {
  boardHighlights,
  bubbleCopy,
  continueLabelFor,
  destinationSquares,
  modeLabelFor,
  orientationFor,
  solvedCountLabel,
  solverIndexFor,
  solverMovesFor,
} from "./use-puzzle-feedback";
import type { Miss, Status } from "./use-puzzle-session";

const template = compilePuzzle(PUZZLE_CATALOG[0]);

function puzzleWith(overrides: Partial<CompiledPuzzle>): CompiledPuzzle {
  return { ...template, ...overrides };
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MISS: Miss = { fen: START_FEN, from: "d1", to: "h5", san: "Qh5" };

test("orientationFor reads the side to move from the puzzle fen", () => {
  assert.equal(orientationFor(puzzleWith({ fen: "k7/8/8/8/8/8/8/K7 w - - 0 1" })), "white");
  assert.equal(orientationFor(puzzleWith({ fen: "k7/8/8/8/8/8/8/K7 b - - 0 1" })), "black");
  assert.equal(orientationFor(null), "white");
});

test("solverMovesFor counts the solver's moves in the line", () => {
  assert.equal(solverMovesFor(puzzleWith({ uci: ["e2e4"] })), 1);
  assert.equal(solverMovesFor(puzzleWith({ uci: ["e2e4", "e7e5", "g1f3"] })), 2);
  assert.equal(solverMovesFor(null), 1);
});

test("solverIndexFor tracks the solver's move number", () => {
  assert.equal(solverIndexFor(0), 1);
  assert.equal(solverIndexFor(2), 2);
  assert.equal(solverIndexFor(3), 2);
});

test("modeLabelFor names each mode", () => {
  assert.equal(modeLabelFor("daily"), "Daily puzzle");
  assert.equal(modeLabelFor("streak"), "Streak");
  assert.equal(modeLabelFor("rush"), "Rush");
  assert.equal(modeLabelFor("rated"), "Rated");
});

test("continueLabelFor only offers a next puzzle when the session keeps going", () => {
  assert.equal(continueLabelFor("rated", false), "Next puzzle");
  assert.equal(continueLabelFor("streak", false), "Next puzzle");
  assert.equal(continueLabelFor("rated", true), null);
  assert.equal(continueLabelFor("daily", false), null);
  assert.equal(continueLabelFor("rush", false), null);
});

test("solvedCountLabel pluralises the rush tally", () => {
  assert.equal(solvedCountLabel(0), "0 puzzles solved");
  assert.equal(solvedCountLabel(1), "1 puzzle solved");
  assert.equal(solvedCountLabel(7), "7 puzzles solved");
});

test("bubbleCopy titles the rush session states", () => {
  const base = {
    mode: "rush" as const,
    reveal: false,
    miss: null,
    hintLevel: 0,
    userTurn: false,
    themes: [],
    runStreak: 0,
    sessionSolved: 4,
    sideToMove: "White",
  };
  assert.equal(
    bubbleCopy({ ...base, sessionOver: true, secondsLeft: 0, status: "playing" }).title,
    "Time is up",
  );
  assert.equal(
    bubbleCopy({ ...base, sessionOver: true, secondsLeft: 12, status: "playing" }).title,
    "Three misses",
  );
});

test("bubbleCopy titles the remaining statuses", () => {
  const base = {
    mode: "rated" as const,
    secondsLeft: 0,
    reveal: false,
    miss: null,
    hintLevel: 0,
    userTurn: true,
    themes: [],
    runStreak: 0,
    sessionSolved: 0,
    sideToMove: "Black",
  };
  assert.equal(bubbleCopy({ ...base, sessionOver: true, status: "failed" }).title, "Streak over");
  assert.equal(bubbleCopy({ ...base, sessionOver: false, status: "solved" }).title, "Solved");
  assert.equal(bubbleCopy({ ...base, sessionOver: false, status: "failed" }).title, "Incorrect");
  assert.equal(bubbleCopy({ ...base, sessionOver: false, status: "playing" }).title, "Black to move");
});

test("bubbleCopy body follows the session state", () => {
  const base = {
    mode: "rated" as const,
    secondsLeft: 0,
    sessionOver: false,
    reveal: false,
    miss: null,
    hintLevel: 0,
    userTurn: true,
    themes: [] as const,
    runStreak: 1,
    sessionSolved: 0,
    sideToMove: "White",
  };
  assert.equal(bubbleCopy({ ...base, status: "solved" }).body, "Great stuff!");
  assert.equal(bubbleCopy({ ...base, status: "solved", runStreak: 3 }).body, "1-2-3 in a row. Great work!");
  assert.equal(bubbleCopy({ ...base, status: "failed", reveal: true, miss: MISS }).body, "Best move: Qh5");
  assert.equal(bubbleCopy({ ...base, status: "failed" }).body, "Look at the marked move.");
  assert.equal(bubbleCopy({ ...base, status: "playing", hintLevel: 2 }).body, "The move is marked.");
  assert.equal(bubbleCopy({ ...base, status: "playing", hintLevel: 1 }).body, "The piece to move is highlighted.");
  assert.equal(bubbleCopy({ ...base, status: "playing", themes: ["fork"] }).body, "One move attacks two pieces. Find the fork.");
  assert.equal(bubbleCopy({ ...base, status: "playing" }).body, "Find the best move.");
  assert.equal(bubbleCopy({ ...base, status: "playing", userTurn: false }).body, "Best move. Keep going.");
});

test("bubbleCopy announces the rush tally when the run is over", () => {
  const { body } = bubbleCopy({
    mode: "rush",
    secondsLeft: 0,
    sessionOver: true,
    status: "failed",
    reveal: false,
    miss: null,
    hintLevel: 0,
    userTurn: false,
    themes: [],
    runStreak: 0,
    sessionSolved: 5,
    sideToMove: "White",
  });
  assert.equal(body, "5 puzzles solved");
});

test("destinationSquares lists legal targets for the selected piece", () => {
  assert.deepEqual(destinationSquares(START_FEN, "e2", true).sort(), ["e3", "e4"]);
  assert.deepEqual(destinationSquares(START_FEN, "e2", false), []);
  assert.deepEqual(destinationSquares(START_FEN, null, true), []);
  assert.deepEqual(destinationSquares(START_FEN, "z9", true), []);
  assert.deepEqual(destinationSquares("", "e2", true), []);
  assert.deepEqual(destinationSquares("not-a-fen", "e2", true), []);
});

test("boardHighlights colours the last move red on a miss and green otherwise", () => {
  const base = {
    hintLevel: 0,
    userTurn: false,
    expected: undefined,
    selected: null,
    miss: null,
    dests: [],
  };
  const failed = boardHighlights({ ...base, last: { from: "e2", to: "e4" }, status: "failed", reveal: false });
  assert.deepEqual(failed.squareStyles.e2, { backgroundColor: "rgba(239, 68, 68, 0.55)" });
  assert.deepEqual(failed.squareStyles.e4, { backgroundColor: "rgba(239, 68, 68, 0.55)" });

  const revealed = boardHighlights({ ...base, last: { from: "e2", to: "e4" }, status: "failed", reveal: true });
  assert.deepEqual(revealed.squareStyles.e4, { backgroundColor: "rgba(186, 202, 68, 0.72)" });

  const solved = boardHighlights({ ...base, last: { from: "e2", to: "e4" }, status: "solved", reveal: false });
  assert.deepEqual(solved.squareStyles.e2, { backgroundColor: "rgba(186, 202, 68, 0.72)" });
});

test("boardHighlights layers hint, selection and destination marks", () => {
  const highlighted = boardHighlights({
    last: { from: "e2", to: "e4" },
    status: "playing",
    reveal: false,
    hintLevel: 1,
    userTurn: true,
    expected: "e2e4",
    selected: "e4",
    miss: null,
    dests: ["e5", "e6"],
  });

  assert.deepEqual(highlighted.squareStyles.e2, { backgroundColor: "rgba(234, 179, 8, 0.7)" });
  assert.deepEqual(highlighted.squareStyles.e4, {
    backgroundColor: "rgba(186, 202, 68, 0.72)",
    boxShadow: "inset 0 0 0 3px rgba(255, 255, 255, 0.55)",
  });
  assert.deepEqual(highlighted.squareStyles.e5, {
    backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.28) 22%, transparent 23%)",
  });
});

test("boardHighlights hides the hint square when it is not the solver's turn", () => {
  const highlighted = boardHighlights({
    last: null,
    status: "playing",
    reveal: false,
    hintLevel: 2,
    userTurn: false,
    expected: "e2e4",
    selected: null,
    miss: null,
    dests: [],
  });
  assert.deepEqual(highlighted.squareStyles, {});
});

test("boardHighlights arrows the revealed move green and the deep hint yellow", () => {
  const base = {
    status: "playing" as const,
    hintLevel: 0,
    userTurn: true,
    expected: "e2e4" as string | undefined,
    selected: null,
    dests: [],
  };

  const revealed = boardHighlights({ ...base, last: null, reveal: true, miss: MISS });
  assert.deepEqual(revealed.arrows, [{ startSquare: "d1", endSquare: "h5", color: MARK_HEX.G }]);

  const hinted = boardHighlights({ ...base, last: null, reveal: false, miss: null, hintLevel: 2 });
  assert.deepEqual(hinted.arrows, [{ startSquare: "e2", endSquare: "e4", color: MARK_HEX.Y }]);

  const none = boardHighlights({ ...base, last: null, reveal: false, miss: null, hintLevel: 1 });
  assert.deepEqual(none.arrows, []);
});

test("boardHighlights arrows nothing while the line has no expected move", () => {
  const highlighted = boardHighlights({
    last: null,
    status: "playing" as Status,
    reveal: false,
    hintLevel: 2,
    userTurn: true,
    expected: undefined,
    selected: null,
    miss: null,
    dests: [],
  });
  assert.deepEqual(highlighted.arrows, []);
});
