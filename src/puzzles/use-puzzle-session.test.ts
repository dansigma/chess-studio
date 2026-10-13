import assert from "node:assert/strict";
import test from "node:test";
import { PUZZLE_CATALOG } from "./catalog.ts";
import { compilePuzzle, dailyPuzzle, type CompiledPuzzle } from "./engine.ts";
import { RUSH_STRIKES, clock, nextSessionScore, pickPuzzle, rushAfterMiss } from "./use-puzzle-session";

const template = compilePuzzle(PUZZLE_CATALOG[0]);

function candidate(id: string, rating: number): CompiledPuzzle {
  return { ...template, id, rating, themes: [] };
}

function withRandom(value: number, run: () => void) {
  const original = Math.random;
  Math.random = () => value;
  try {
    run();
  } finally {
    Math.random = original;
  }
}

test("clock formats remaining rush time as m:ss", () => {
  assert.equal(clock(0), "0:00");
  assert.equal(clock(9), "0:09");
  assert.equal(clock(59), "0:59");
  assert.equal(clock(60), "1:00");
  assert.equal(clock(125), "2:05");
  assert.equal(clock(180), "3:00");
});

test("nextSessionScore bumps on a solve and holds on a miss", () => {
  assert.equal(nextSessionScore(true, 0), 1);
  assert.equal(nextSessionScore(true, 4), 5);
  assert.equal(nextSessionScore(false, 4), 4);
});

test("rushAfterMiss ends the session on the third miss or at zero seconds", () => {
  assert.deepEqual(rushAfterMiss(0, 120), { strikes: 1, over: false });
  assert.deepEqual(rushAfterMiss(1, 120), { strikes: 2, over: false });
  assert.deepEqual(rushAfterMiss(RUSH_STRIKES - 1, 120), { strikes: RUSH_STRIKES, over: true });
  assert.deepEqual(rushAfterMiss(0, 0), { strikes: 1, over: true });
  assert.deepEqual(rushAfterMiss(1, 0), { strikes: 2, over: true });
});

test("pickPuzzle delegates the daily mode to the date-keyed daily puzzle", () => {
  const puzzles = PUZZLE_CATALOG.slice(0, 10).map(compilePuzzle);
  const picked = pickPuzzle(puzzles, "daily", null, { rating: 1200 }, 0, new Set());
  assert.equal(picked?.id, dailyPuzzle(puzzles, Date.now())?.id);
});

test("pickPuzzle returns null when nothing is rankable", () => {
  assert.equal(pickPuzzle([], "rated", null, { rating: 1200 }, 0, new Set()), null);
});

test("pickPuzzle prefers the closest rating and skips excluded puzzles", () => {
  const puzzles = [candidate("a", 1200), candidate("b", 1300), candidate("c", 1400)];
  withRandom(0, () => {
    assert.equal(pickPuzzle(puzzles, "rated", null, { rating: 1200 }, 0, new Set())?.id, "a");
    assert.equal(pickPuzzle(puzzles, "rated", null, { rating: 1200 }, 0, new Set(["a"]))?.id, "b");
    assert.equal(pickPuzzle(puzzles, "rated", null, { rating: 1200 }, 0, new Set(["a", "b"]))?.id, "c");
  });
});

test("pickPuzzle samples only the four closest puzzles", () => {
  const puzzles = [1200, 1300, 1400, 1500, 1600, 1700].map((rating, index) =>
    candidate(`p${index}`, rating),
  );
  withRandom(0.99, () => {
    assert.equal(pickPuzzle(puzzles, "rated", null, { rating: 1200 }, 0, new Set())?.id, "p3");
  });
  withRandom(0, () => {
    assert.equal(pickPuzzle(puzzles, "rated", null, { rating: 1200 }, 0, new Set())?.id, "p0");
  });
});

test("pickPuzzle shifts the target by mode and solved count", () => {
  const puzzles = [candidate("low", 1000), candidate("mid", 1200), candidate("high", 1400)];
  withRandom(0, () => {
    assert.equal(pickPuzzle(puzzles, "rated", null, { rating: 1200 }, 0, new Set())?.id, "mid");
    assert.equal(pickPuzzle(puzzles, "rush", null, { rating: 1200 }, 0, new Set())?.id, "low");
    assert.equal(pickPuzzle(puzzles, "streak", null, { rating: 1200 }, 5, new Set())?.id, "high");
  });
});
