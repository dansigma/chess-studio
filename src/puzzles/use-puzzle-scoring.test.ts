import assert from "node:assert/strict";
import test from "node:test";
import { applyResult, dateKey, emptyProgress } from "./engine";
import { applyPuzzleResult } from "./use-puzzle-scoring";

test("applyPuzzleResult reports rating delta and xp gained for a win", () => {
  const current = emptyProgress();
  const attempt = {
    id: "p1",
    mode: "rated" as const,
    success: true,
    puzzleRating: 1200,
    sessionScore: 1,
    now: 1_700_000_000_000,
    themes: [],
    ms: null,
  };

  const { next, delta, gained } = applyPuzzleResult(current, attempt);

  assert.equal(next.rating, 1216, "rating rises 16 on an even match");
  assert.equal(delta, 16, "delta is the rating change");
  assert.equal(gained, 50, "xp gained follows puzzlePoints for a streak of 1");
  assert.deepEqual(next, applyResult(current, attempt), "wraps applyResult unchanged");
});

test("applyPuzzleResult reports a negative delta and no xp for a loss", () => {
  const current = emptyProgress();
  const { next, delta, gained } = applyPuzzleResult(current, {
    id: "p2",
    mode: "rated",
    success: false,
    puzzleRating: 1200,
    sessionScore: 0,
    now: 1_700_000_000_000,
    themes: [],
    ms: null,
  });

  assert.equal(delta, -16, "rating drops 16");
  assert.equal(gained, 0, "no xp for a failed puzzle");
  assert.equal(next.failed, 1);
});

test("applyPuzzleResult reports no change when applyResult short-circuits", () => {
  const now = 1_700_000_000_000;
  const attempt = {
    id: "p3",
    mode: "daily" as const,
    success: true,
    puzzleRating: 1200,
    sessionScore: 1,
    now,
    themes: [],
    ms: null,
  };
  const current = { ...emptyProgress(), daily: dateKey(now) };

  const { next, delta, gained } = applyPuzzleResult(current, attempt);

  assert.equal(delta, 0, "already-solved daily puzzle leaves the rating alone");
  assert.equal(gained, 0, "and awards no xp");
  assert.deepEqual(next, current);
});

test("applyPuzzleResult keeps non-rated modes from changing the rating", () => {
  const current = emptyProgress();
  const { next, delta, gained } = applyPuzzleResult(current, {
    id: "p4",
    mode: "streak",
    success: true,
    puzzleRating: 1800,
    sessionScore: 4,
    now: 1_700_000_000_000,
    themes: [],
    ms: null,
  });

  assert.equal(next.rating, current.rating, "streak mode does not touch the rating");
  assert.equal(delta, 0);
  assert.ok(gained > 0, "but still awards xp");
});
