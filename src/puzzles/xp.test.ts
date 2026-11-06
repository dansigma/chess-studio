import assert from "node:assert/strict";
import test from "node:test";
import {
  cumulativeXpForLevel,
  difficultyFactor,
  levelFromXp,
  speedFactor,
  xpBreakdown,
  xpForLevel,
  type XpInput,
} from "./xp";

const SOLVED: XpInput = {
  success: true,
  puzzleRating: 1200,
  userRating: 1200,
  solverMoves: 1,
  ms: 60_000,
  hinted: false,
};

test("an even, slow, clean solve is base x first try", () => {
  assert.deepEqual(xpBreakdown(SOLVED), {
    base: 20,
    factors: [{ key: "firstTry", value: 1.2 }],
    total: 24,
  });
});

test("difficulty scales with the rating gap and is clamped to 0.5-2.0", () => {
  assert.equal(difficultyFactor(1200, 1200), 1);
  assert.equal(difficultyFactor(1600, 1200), 2);
  assert.equal(difficultyFactor(2800, 1200), 2, "clamped high");
  assert.equal(difficultyFactor(800, 1200), 0.5);
  assert.equal(difficultyFactor(100, 1200), 0.5, "clamped low");
  assert.ok(difficultyFactor(1400, 1200) > 1 && difficultyFactor(1400, 1200) < 2);
  assert.ok(difficultyFactor(1000, 1200) < 1 && difficultyFactor(1000, 1200) > 0.5);
});

test("speed is 1.5 when fast, fades to 1.0 at par, and needs a time", () => {
  assert.equal(speedFactor(0, 1), 1.5);
  assert.equal(speedFactor(5_000, 1), 1.5, "25% of par still gets the full bonus");
  assert.equal(speedFactor(20_000, 1), 1, "par earns nothing");
  assert.equal(speedFactor(90_000, 1), 1);
  const mid = speedFactor(12_500, 1);
  assert.ok(mid > 1 && mid < 1.5, `mid-range bonus, got ${mid}`);
  assert.equal(speedFactor(null, 1), 1);
  assert.equal(speedFactor(Number.NaN, 1), 1);
  // Par scales with the number of solver moves.
  assert.ok(speedFactor(30_000, 3) > speedFactor(30_000, 1));
});

test("the headline example: hard and fast and first try", () => {
  const result = xpBreakdown({ ...SOLVED, puzzleRating: 1600, ms: 1000 });
  assert.deepEqual(result.factors.map((factor) => factor.key), ["difficulty", "speed", "firstTry"]);
  assert.equal(result.total, Math.round(20 * 2 * 1.5 * 1.2));
});

test("hints remove the speed and first-try bonuses but keep difficulty", () => {
  const hinted = xpBreakdown({ ...SOLVED, puzzleRating: 1400, ms: 500, hinted: true });
  assert.deepEqual(hinted.factors.map((factor) => factor.key), ["difficulty"]);
  assert.equal(hinted.total, Math.round(20 * difficultyFactor(1400, 1200)));
  const clean = xpBreakdown({ ...SOLVED, puzzleRating: 1400, ms: 500 });
  assert.ok(clean.total > hinted.total);
});

test("a hinted, even puzzle is just the base", () => {
  assert.deepEqual(xpBreakdown({ ...SOLVED, hinted: true, ms: 100 }), { base: 20, factors: [], total: 20 });
});

test("an easy puzzle can shrink the total below the base", () => {
  const result = xpBreakdown({ ...SOLVED, puzzleRating: 800, hinted: true });
  assert.deepEqual(result.factors, [{ key: "difficulty", value: 0.5 }]);
  assert.equal(result.total, 10);
});

test("only the total is rounded: the shown factors multiply to it", () => {
  const result = xpBreakdown({ ...SOLVED, puzzleRating: 1333, ms: 8_000 });
  const product = result.factors.reduce((acc, factor) => acc * factor.value, result.base);
  assert.equal(result.total, Math.round(product));
  assert.ok(Number.isInteger(result.total));
});

test("a missed puzzle awards nothing, hinted or not", () => {
  for (const hinted of [true, false]) {
    assert.deepEqual(xpBreakdown({ ...SOLVED, success: false, hinted }), { base: 0, factors: [], total: 0 });
  }
});

test("xpForLevel is round(100 * 1.3^(n-1)) and stops growing after level 20", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(xpForLevel), [100, 130, 169, 220, 286]);
  assert.equal(xpForLevel(20), Math.round(100 * 1.3 ** 19));
  assert.equal(xpForLevel(21), xpForLevel(20));
  assert.equal(xpForLevel(60), xpForLevel(20));
  assert.equal(xpForLevel(0), 100, "defensive floor");
});

test("levelFromXp walks the curve and reports xp to the next level", () => {
  assert.deepEqual(levelFromXp(0), { level: 1, into: 0, span: 100, toNext: 100 });
  assert.deepEqual(levelFromXp(99), { level: 1, into: 99, span: 100, toNext: 1 });
  assert.deepEqual(levelFromXp(100), { level: 2, into: 0, span: 130, toNext: 130 });
  assert.deepEqual(levelFromXp(229), { level: 2, into: 129, span: 130, toNext: 1 });
  assert.deepEqual(levelFromXp(230), { level: 3, into: 0, span: 169, toNext: 169 });
  assert.deepEqual(levelFromXp(-5), levelFromXp(0));
  assert.deepEqual(levelFromXp(Number.NaN), levelFromXp(0));
});

test("levelFromXp agrees with the cumulative table at every boundary", () => {
  for (let level = 1; level <= 30; level += 1) {
    const start = cumulativeXpForLevel(level);
    assert.equal(levelFromXp(start).level, level);
    assert.equal(levelFromXp(start).into, 0);
    if (start > 0) {
      assert.equal(levelFromXp(start - 1).level, level - 1);
    }
  }
});

test("level 10 costs about a month of play", () => {
  // ~5 attempts/day, ~21 xp per attempt (see the tuning note in xp.ts).
  const month = 30 * 5 * 21;
  const reached = levelFromXp(month).level;
  assert.ok(reached >= 9 && reached <= 11, `expected ~level 10, got ${reached}`);
});
