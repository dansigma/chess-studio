import assert from "node:assert/strict";
import test from "node:test";
import { PUZZLE_STRING_KEYS, tPuzzle, tPuzzleCount } from "@/src/i18n/puzzle-strings";
import { cumulativeXpForLevel, xpBreakdown } from "./xp";
import type { XpResult } from "./use-puzzle-scoring";
import { localDayKey } from "./activity";
import { emptyProgress } from "./engine";
import {
  buildSessionSummary,
  cardsForMode,
  CHEER_KEYS,
  cheerBucket,
  cheerKeyFor,
  SUMMARY_LIST_LIMIT,
  summaryVisible,
  visibleRows,
  type SessionAttempt,
} from "./session-summary";
import type { PuzzleProgress } from "./types";

const NOW = new Date(2026, 10, 5, 12, 0, 0).getTime();
const DAY = 86_400_000;

const PUZZLE = { id: "00sHx", fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", sans: ["Re8#"] };

function xpFor(success: boolean): XpResult {
  const breakdown = xpBreakdown({
    success,
    puzzleRating: 1200,
    userRating: 1200,
    solverMoves: 1,
    ms: 10_000,
    hinted: false,
  });
  return { breakdown, awarded: true };
}

function attempt(success: boolean, over: Partial<SessionAttempt> = {}): SessionAttempt {
  return { success, firstTry: success, ms: 10_000, at: NOW, puzzle: PUZZLE, xp: xpFor(success), ...over };
}

function progress(over: Partial<PuzzleProgress> = {}): PuzzleProgress {
  return { ...emptyProgress(), ...over };
}

test("cards per mode: only rated gets the rating card", () => {
  assert.deepEqual(cardsForMode("rated"), ["did", "level", "rating"]);
  for (const mode of ["streak", "rush", "daily", "mistakes"] as const) {
    assert.deepEqual(cardsForMode(mode), ["did", "level"], mode);
  }
});

test("counts, time, accuracy and first-try come from the attempts", () => {
  const summary = buildSessionSummary({
    mode: "rated",
    attempts: [
      attempt(true, { ms: 5_000 }),
      attempt(true, { firstTry: false, ms: 15_000 }),
      attempt(false, { firstTry: false, ms: 10_000 }),
      attempt(true, { ms: 10_000 }),
    ],
    before: progress({ rating: 1200 }),
    after: progress({ rating: 1230 }),
  });
  assert.equal(summary.attempts, 4);
  assert.equal(summary.solved, 3);
  assert.equal(summary.failed, 1);
  assert.equal(summary.firstTry, 2);
  assert.equal(summary.trainingMs, 40_000);
  assert.equal(summary.avgMs, 10_000);
  assert.equal(summary.accuracy, 75);
  assert.deepEqual(summary.rating, { before: 1200, after: 1230, change: 30 });
});

test("an empty session has no averages and no division by zero", () => {
  const summary = buildSessionSummary({ mode: "rush", attempts: [], before: progress(), after: progress() });
  assert.equal(summary.avgMs, null);
  assert.equal(summary.accuracy, null);
  assert.equal(summary.cheerBucket, "tough");
  assert.equal(summary.dayStreak, null);
  assert.equal(summary.rating, null);
});

// SIG-1250: untimed attempts (ms: null, e.g. an unstamped first-puzzle clock)
// contribute no time and are excluded from the average denominator; an
// all-untimed session has no average.
test("untimed attempts are excluded from the session average", () => {
  const mixed = buildSessionSummary({
    mode: "rated",
    attempts: [attempt(true, { ms: 5_000 }), attempt(true, { ms: null }), attempt(false, { firstTry: false, ms: 15_000 })],
    before: progress({ rating: 1200 }),
    after: progress({ rating: 1230 }),
  });
  assert.equal(mixed.trainingMs, 20_000);
  assert.equal(mixed.avgMs, 10_000);
  const untimed = buildSessionSummary({
    mode: "rated",
    attempts: [attempt(true, { ms: null }), attempt(false, { firstTry: false, ms: null })],
    before: progress({ rating: 1200 }),
    after: progress({ rating: 1200 }),
  });
  assert.equal(untimed.trainingMs, 0);
  assert.equal(untimed.avgMs, null);
});

test("xp earned and the level-up come from the two snapshots", () => {
  const start = cumulativeXpForLevel(6) + 10;
  const levelUp = buildSessionSummary({
    mode: "streak",
    attempts: [attempt(true)],
    before: progress({ xp: start }),
    after: progress({ xp: cumulativeXpForLevel(7) + 20 }),
  });
  assert.equal(levelUp.level.xpEarned, cumulativeXpForLevel(7) + 20 - start);
  assert.equal(levelUp.level.levelUp, true);
  assert.equal(levelUp.level.before.level, 6);
  assert.equal(levelUp.level.after.level, 7);

  const same = buildSessionSummary({
    mode: "streak",
    attempts: [attempt(true)],
    before: progress({ xp: start }),
    after: progress({ xp: start + 24 }),
  });
  assert.equal(same.level.xpEarned, 24);
  assert.equal(same.level.levelUp, false);
});

test("mistakes practice reports practice only and no XP", () => {
  const summary = buildSessionSummary({
    mode: "mistakes",
    attempts: [attempt(true)],
    before: progress({ xp: 50 }),
    after: progress({ xp: 50 }),
  });
  assert.equal(summary.level.practiceOnly, true);
  assert.equal(summary.level.xpEarned, 0);
  assert.equal(summary.rating, null);
});

test("the day streak shows only when it grew during the session", () => {
  const yesterday = localDayKey(NOW - DAY);
  const today = localDayKey(NOW);
  const day = { solved: 1, failed: 0, ms: 1000, xp: 0 };
  const before = progress({ days: { [yesterday]: day } });
  const grew = buildSessionSummary({
    mode: "rated",
    attempts: [attempt(true)],
    before,
    after: progress({ days: { [yesterday]: day, [today]: day } }),
  });
  assert.equal(grew.dayStreak, 2);

  const alreadyToday = progress({ days: { [yesterday]: day, [today]: day } });
  const flat = buildSessionSummary({
    mode: "rated",
    attempts: [attempt(true)],
    before: alreadyToday,
    after: alreadyToday,
  });
  assert.equal(flat.dayStreak, null);
});

test("best line: rush best score and streak run", () => {
  const rush = buildSessionSummary({
    mode: "rush",
    attempts: [attempt(true)],
    before: progress(),
    after: progress({ rushBest: 9, bestStreak: 4 }),
  });
  assert.deepEqual(rush.bestLine, { kind: "rush", best: 9 });
  const streak = buildSessionSummary({
    mode: "streak",
    attempts: [attempt(true), attempt(true)],
    before: progress(),
    after: progress({ bestStreak: 4 }),
  });
  assert.deepEqual(streak.bestLine, { kind: "streak", solved: 2, best: 4 });
  assert.equal(
    buildSessionSummary({ mode: "daily", attempts: [attempt(true)], before: progress(), after: progress() }).bestLine,
    null,
  );
});

test("encouraging line: bucket by result, variant is deterministic", () => {
  assert.equal(cheerBucket(5, 0), "perfect");
  assert.equal(cheerBucket(3, 3), "good");
  assert.equal(cheerBucket(2, 3), "tough");
  assert.equal(cheerBucket(0, 1), "tough");
  assert.equal(cheerBucket(0, 0), "tough");
  assert.ok(CHEER_KEYS.perfect.includes(cheerKeyFor(5, 0, 5)));
  assert.ok(CHEER_KEYS.good.includes(cheerKeyFor(4, 2, 3)));
  assert.ok(CHEER_KEYS.tough.includes(cheerKeyFor(1, 4, 0)));
  // same data, same line; different data can pick a different variant
  assert.equal(cheerKeyFor(4, 2, 3), cheerKeyFor(4, 2, 3));
  const variants = new Set([1, 2, 3, 4, 5, 6].map((solved) => cheerKeyFor(solved, 0, solved)));
  assert.equal(variants.size, 3, "all perfect variants are reachable");
});

test("every cheer line exists in both locales", () => {
  for (const bucket of Object.values(CHEER_KEYS)) {
    assert.equal(bucket.length, 3);
    for (const key of bucket) {
      assert.ok(PUZZLE_STRING_KEYS.includes(key));
      assert.ok(tPuzzle("en", key).length > 0);
      assert.ok(tPuzzle("pt-br", key).length > 0);
    }
  }
});

const idle = {
  attempts: 2,
  finished: false,
  sessionOver: false,
  status: "solved" as const,
  reveal: false,
  caughtUp: false,
  exhausted: false,
};

test("session end: rated waits for the user to finish", () => {
  assert.equal(summaryVisible({ ...idle, mode: "rated" }), false);
  assert.equal(summaryVisible({ ...idle, mode: "rated", finished: true }), true);
  assert.equal(summaryVisible({ ...idle, mode: "rated", finished: true, attempts: 0 }), false);
});

test("session end: streak at the first miss, once the best move is revealed", () => {
  assert.equal(summaryVisible({ ...idle, mode: "streak" }), false);
  assert.equal(summaryVisible({ ...idle, mode: "streak", sessionOver: true, status: "failed" }), false);
  assert.equal(summaryVisible({ ...idle, mode: "streak", sessionOver: true, status: "failed", reveal: true }), true);
});

test("session end: rush at the timer or the third miss, even with no attempts", () => {
  assert.equal(summaryVisible({ ...idle, mode: "rush", attempts: 0, sessionOver: true, status: "playing" }), true);
  assert.equal(summaryVisible({ ...idle, mode: "rush", sessionOver: false, status: "playing" }), false);
});

test("session end: daily right after the puzzle", () => {
  assert.equal(summaryVisible({ ...idle, mode: "daily", attempts: 1, status: "playing" }), false);
  assert.equal(summaryVisible({ ...idle, mode: "daily", attempts: 1, status: "solved" }), true);
  assert.equal(summaryVisible({ ...idle, mode: "daily", attempts: 1, status: "failed" }), false);
  assert.equal(summaryVisible({ ...idle, mode: "daily", attempts: 1, status: "failed", reveal: true }), true);
});

test("session end: mistakes when the queue is empty or the user finishes", () => {
  assert.equal(summaryVisible({ ...idle, mode: "mistakes" }), false);
  assert.equal(summaryVisible({ ...idle, mode: "mistakes", caughtUp: true }), true);
  assert.equal(summaryVisible({ ...idle, mode: "mistakes", finished: true }), true);
  // an empty queue with no attempts keeps the caught-up page
  assert.equal(summaryVisible({ ...idle, mode: "mistakes", attempts: 0, caughtUp: true }), false);
});

test("session end: an exhausted pool ends a session that has attempts", () => {
  assert.equal(summaryVisible({ ...idle, mode: "rated", exhausted: true }), true);
  assert.equal(summaryVisible({ ...idle, mode: "rated", attempts: 0, exhausted: true }), false);
});

test("rows list every attempt in order with its own XP breakdown", () => {
  const summary = buildSessionSummary({
    mode: "rated",
    attempts: [attempt(true), attempt(false, { puzzle: { ...PUZZLE, id: "abcde" } })],
    before: progress(),
    after: progress(),
  });
  assert.equal(summary.rows.length, 2);
  assert.deepEqual(
    summary.rows.map((row) => [row.number, row.puzzle.id, row.success, row.breakdown.total, row.practiceOnly]),
    [
      [1, "00sHx", true, 32, false],
      [2, "abcde", false, 0, false],
    ],
  );
});

test("daily has one row; mistakes rows are practice only; an un-awarded XP result is practice only", () => {
  const daily = buildSessionSummary({ mode: "daily", attempts: [attempt(true)], before: progress(), after: progress() });
  assert.equal(daily.rows.length, 1);
  const mistakes = buildSessionSummary({
    mode: "mistakes",
    attempts: [attempt(true), attempt(false)],
    before: progress(),
    after: progress(),
  });
  assert.deepEqual(
    mistakes.rows.map((row) => row.practiceOnly),
    [true, true],
  );
  const repeated = buildSessionSummary({
    mode: "daily",
    attempts: [attempt(true, { xp: { ...xpFor(true), awarded: false } })],
    before: progress(),
    after: progress(),
  });
  assert.equal(repeated.rows[0]?.practiceOnly, true);
});

test("visibleRows keeps the last 10 until show-all", () => {
  const attempts = Array.from({ length: 13 }, () => attempt(true));
  const { rows } = buildSessionSummary({ mode: "rated", attempts, before: progress(), after: progress() });
  assert.equal(rows.length, 13);
  const shown = visibleRows(rows, false);
  assert.equal(shown.length, SUMMARY_LIST_LIMIT);
  assert.equal(shown[0]?.number, 4);
  assert.equal(shown.at(-1)?.number, 13);
  assert.equal(visibleRows(rows, true).length, 13);
  assert.equal(visibleRows(rows.slice(0, 3), false).length, 3);
});

test("counts use singular and plural forms in both locales", () => {
  const cases: [number, string, string][] = [
    [1, "1 solved", "1 resolvido"],
    [2, "2 solved", "2 resolvidos"],
  ];
  for (const [n, en, pt] of cases) {
    assert.equal(tPuzzleCount("en", "puzzle.summary.count.solved", n), en);
    assert.equal(tPuzzleCount("pt-br", "puzzle.summary.count.solved", n), pt);
  }
  assert.equal(tPuzzleCount("en", "puzzle.summary.count.failed", 1), "1 failed");
  assert.equal(tPuzzleCount("pt-br", "puzzle.summary.count.failed", 1), "1 errado");
  assert.equal(tPuzzleCount("pt-br", "puzzle.summary.count.failed", 2), "2 errados");
  assert.equal(tPuzzleCount("pt-br", "puzzle.summary.count.failed", 5), "5 errados");
  assert.equal(tPuzzleCount("pt-br", "puzzle.summary.did.firstTry", 1), "Certo de primeira");
  assert.equal(tPuzzleCount("pt-br", "puzzle.summary.did.firstTry", 3), "Certos de primeira");
});
