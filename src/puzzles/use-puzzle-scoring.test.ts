import assert from "node:assert/strict";
import test from "node:test";
import { applyResult, dateKey, emptyProgress } from "./engine";
import { localDayKey } from "./activity";
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
  assert.equal(gained, 24, "xp gained is 20 base x 1.2 first try (no timing, so no speed)");
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

test("applyPuzzleResult returns the breakdown and flags whether it was awarded", () => {
  const now = 1_700_000_000_000;
  const attempt = {
    id: "p5",
    mode: "rated" as const,
    success: true,
    puzzleRating: 1600,
    sessionScore: 1,
    now,
    themes: [],
    ms: 2000,
    solverMoves: 1,
  };
  const current = emptyProgress();
  const win = applyPuzzleResult(current, attempt);
  assert.deepEqual(win.xp.breakdown, {
    base: 20,
    factors: [
      { key: "difficulty", value: 2 },
      { key: "speed", value: 1.5 },
      { key: "firstTry", value: 1.2 },
    ],
    total: 72,
  });
  assert.equal(win.xp.awarded, true);
  assert.equal(win.gained, win.xp.breakdown.total, "progress gains exactly the displayed total");

  const practice = applyPuzzleResult(current, { ...attempt, mode: "mistakes" });
  assert.equal(practice.xp.breakdown.total, 72, "practice still shows what the solve was worth");
  assert.equal(practice.xp.awarded, false);
  assert.equal(practice.gained, 0);

  const repeatDaily = applyPuzzleResult({ ...current, daily: dateKey(now) }, { ...attempt, mode: "daily" });
  assert.equal(repeatDaily.xp.awarded, false);
});

test("applyPuzzleResult: a hint drops speed and first try from the awarded xp", () => {
  const { xp, gained } = applyPuzzleResult(emptyProgress(), {
    id: "p6",
    mode: "rated",
    success: true,
    puzzleRating: 1200,
    sessionScore: 1,
    now: 1_700_000_000_000,
    themes: [],
    ms: 1000,
    hinted: true,
  });
  assert.deepEqual(xp.breakdown, { base: 20, factors: [], total: 20 });
  assert.equal(gained, 20);
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

test("applyPuzzleResult leaves everything but today's activity for mistakes attempts", () => {
  const rated = applyResult(emptyProgress(), {
    id: "rated-1",
    mode: "rated",
    success: true,
    puzzleRating: 1500,
    sessionScore: 2,
    now: 1_700_000_000_000,
    themes: ["fork"],
    ms: 500,
  });
  for (const success of [true, false]) {
    const { next, delta, gained } = applyPuzzleResult(rated, {
      id: "mx:abc",
      mode: "mistakes",
      success,
      puzzleRating: 1500,
      sessionScore: 3,
      now: 1_700_000_001_000,
      themes: [],
      ms: 2000,
    });
    assert.deepEqual({ ...next, days: {} }, { ...rated, days: {} });
    assert.notEqual(next, rated);
    assert.equal(delta, 0, "mistakes attempts change no rating");
    assert.equal(gained, 0, "mistakes attempts award no xp");
  }
});

test("a solved rated puzzle adds the breakdown total to today's activity xp", () => {
  const now = 1_700_000_000_000;
  const attempt = {
    id: "p7",
    mode: "rated" as const,
    success: true,
    puzzleRating: 1400,
    sessionScore: 1,
    now,
    themes: [],
    ms: 3000,
    solverMoves: 1,
  };
  const first = applyPuzzleResult(emptyProgress(), attempt);
  const today = localDayKey(now);
  assert.ok(first.xp.breakdown.total > 0);
  assert.equal(first.next.days?.[today]?.xp, first.xp.breakdown.total);
  assert.equal(first.next.days?.[today]?.ms, 3000, "the per-puzzle ms is recorded too");

  const second = applyPuzzleResult(first.next, { ...attempt, id: "p8", hinted: true });
  assert.equal(second.next.days?.[today]?.xp, first.xp.breakdown.total + second.xp.breakdown.total);

  const missed = applyPuzzleResult(second.next, { ...attempt, id: "p9", success: false });
  assert.equal(missed.next.days?.[today]?.xp, second.next.days?.[today]?.xp, "a miss adds no xp");

  const practice = applyPuzzleResult(missed.next, { ...attempt, id: "p10", mode: "mistakes" });
  assert.equal(practice.next.days?.[today]?.xp, missed.next.days?.[today]?.xp, "practice records 0 xp");
  assert.equal(practice.xp.awarded, false, "practice is flagged as not awarded");
});

// SIG-1256: a difficulty session never changes the rating; everything else is rated-mode.
test("applyPuzzleResult leaves the rating alone only for an unrated attempt", () => {
  const current = emptyProgress();
  const attempt = {
    id: "p1",
    mode: "rated" as const,
    success: true,
    puzzleRating: 1500,
    sessionScore: 1,
    now: 1_700_000_000_000,
    themes: ["fork" as const],
    ms: 5000,
  };
  const normal = applyPuzzleResult(current, attempt);
  const unrated = applyPuzzleResult(current, { ...attempt, unrated: true });
  assert.notEqual(normal.next.rating, current.rating);
  assert.equal(unrated.next.rating, current.rating);
  assert.equal(unrated.delta, 0);
  assert.equal(unrated.next.history[0]?.delta, 0);
  assert.equal(unrated.next.xp, normal.next.xp);
  assert.equal(unrated.next.solved, normal.next.solved);
  assert.equal(unrated.next.streak, normal.next.streak);
});
