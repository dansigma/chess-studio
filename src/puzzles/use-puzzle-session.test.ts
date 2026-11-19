import assert from "node:assert/strict";
import test from "node:test";
import { PUZZLE_CATALOG } from "./catalog.ts";
import { compilePuzzle, dailyPuzzle, playUci, type CompiledPuzzle } from "./engine.ts";
import {
  RUSH_STRIKES,
  buildScrubFrames,
  capExcludeIds,
  clock,
  elapsedMs,
  loadWindowedCatalog,
  nextSessionScore,
  nextViewPly,
  pickPuzzle,
  ratingWindowRequests,
  rushAfterMiss,
} from "./use-puzzle-session";

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

test("ratingWindowRequests widens by 100 up to four attempts", () => {
  assert.deepEqual(ratingWindowRequests(1500), [
    { minRating: 1400, maxRating: 1600 },
    { minRating: 1300, maxRating: 1700 },
    { minRating: 1200, maxRating: 1800 },
    { minRating: 1100, maxRating: 1900 },
  ]);
});

test("ratingWindowRequests clamps the lower bound at zero", () => {
  assert.deepEqual(ratingWindowRequests(50)[0], { minRating: 0, maxRating: 150 });
});

test("loadWindowedCatalog stops at the first window with enough puzzles", async () => {
  const calls: Array<{ minRating?: number; maxRating?: number }> = [];
  const loader = async (options?: { minRating?: number; maxRating?: number }) => {
    calls.push({ minRating: options?.minRating, maxRating: options?.maxRating });
    return calls.length === 1 ? [candidate("thin", 1200)] : [1, 2, 3, 4, 5, 6].map((n) => candidate(`p${n}`, 1200 + n));
  };
  const catalog = await loadWindowedCatalog("rated", null, 1200, 0, new Set(), loader as never);
  assert.equal(catalog.length, 6);
  assert.deepEqual(calls, [
    { minRating: 1100, maxRating: 1300 },
    { minRating: 1000, maxRating: 1400 },
  ]);
});

test("loadWindowedCatalog returns the widest window when all are thin", async () => {
  const loader = async () => [candidate("only", 1200)];
  const catalog = await loadWindowedCatalog("rated", null, 1200, 0, new Set(), loader as never);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0]?.id, "only");
});

// SIG-1179: a fully-seen pool yields no pick (the session surfaces the
// exhausted empty state) instead of silently repeating a seen puzzle.
test("pickPuzzle returns null when every puzzle is excluded", () => {
  const puzzles = [candidate("a", 1200), candidate("b", 1300)];
  assert.equal(pickPuzzle(puzzles, "rated", null, { rating: 1200 }, 0, new Set(["a", "b"])), null);
});

// SIG-1179: seen ids survive theme switches — exclusion is cross-theme: a
// puzzle seen while training theme A never reappears under theme B.
test("pickPuzzle excludes seen ids regardless of theme", () => {
  const dual = { ...template, id: "dual", rating: 1200, themes: ["pin", "fork"] as never };
  const otherFork = { ...candidate("other-fork", 1200), themes: ["fork"] as never };
  const puzzles = [dual, otherFork];
  withRandom(0, () => {
    // Training "fork" with "dual" already seen serves the other fork puzzle.
    const picked = pickPuzzle(puzzles, "rated", "fork", { rating: 1200 }, 0, new Set(["dual"]));
    assert.equal(picked?.id, "other-fork");
    // And once every fork puzzle is seen, nothing comes back (no repeat).
    const exhausted = pickPuzzle(
      puzzles,
      "rated",
      "fork",
      { rating: 1200 },
      0,
      new Set(["dual", "other-fork"]),
    );
    assert.equal(exhausted, null);
  });
});

test("capExcludeIds keeps the newest ids within the cap", () => {
  const exclude = new Set(["a", "b", "c", "d"]);
  assert.deepEqual(capExcludeIds(exclude, 2), ["c", "d"]);
  assert.deepEqual(capExcludeIds(exclude), ["a", "b", "c", "d"]);
  assert.deepEqual(capExcludeIds(new Set(), 2), []);
});

// SIG-1250: an unstamped clock records no time (null) instead of
// `Date.now() - 0`, a Unix timestamp. A stamped clock measures normally and a
// future stamp clamps to zero.
test("elapsedMs returns null for an unstamped clock", () => {
  assert.equal(elapsedMs(null, 1_793_479_702_000), null);
  assert.equal(elapsedMs(1_793_479_690_000, 1_793_479_702_000), 12_000);
  assert.equal(elapsedMs(1_793_479_702_000, 1_793_479_690_000), 0);
});

// SIG-1256: difficulty bands replace the rating windows and the rating target.
test("loadWindowedCatalog with a difficulty requests exactly the band, once when enough", async () => {
  const calls: Array<{ minRating?: number; maxRating?: number }> = [];
  const loader = async (options?: { minRating?: number; maxRating?: number }) => {
    calls.push({ minRating: options?.minRating, maxRating: options?.maxRating });
    return [1, 2, 3, 4, 5].map((n) => candidate(`p${n}`, 1900 + n));
  };
  await loadWindowedCatalog("rated", null, 1000, 0, new Set(), loader as never, "advanced");
  assert.deepEqual(calls, [{ minRating: 1800, maxRating: 3000 }]);
});

test("pickPuzzle with a difficulty targets the band midpoint and ignores out-of-band puzzles", () => {
  const puzzles = [candidate("low", 900), candidate("edge", 1810), candidate("mid", 2400)];
  withRandom(0, () => {
    assert.equal(pickPuzzle(puzzles, "rated", null, { rating: 900 }, 0, new Set(), "advanced")?.id, "mid");
    assert.equal(pickPuzzle(puzzles, "rated", null, { rating: 900 }, 0, new Set(["mid"]), "advanced")?.id, "edge");
    assert.equal(pickPuzzle(puzzles, "rated", null, { rating: 900 }, 0, new Set(["mid", "edge"]), "advanced"), null);
  });
});

test("buildScrubFrames and nextViewPly step backward and forward on solved multi-move puzzles", () => {
  const multi = PUZZLE_CATALOG.map(compilePuzzle).find((p) => p.uci.length >= 3);
  assert.ok(multi);
  const m0 = playUci(multi.fen, multi.uci[0]);
  const m1 = playUci(m0.fen, multi.uci[1]);
  const m2 = playUci(m1.fen, multi.uci[2]);
  const played = [
    { fen: m0.fen, last: { from: m0.from, to: m0.to } },
    { fen: m1.fen, last: { from: m1.from, to: m1.to } },
    { fen: m2.fen, last: { from: m2.from, to: m2.to } },
  ];

  const frames = buildScrubFrames(multi, played, "solved", 3);
  assert.equal(frames.length, 4);
  assert.deepEqual(frames[0], { fen: multi.fen, last: null });
  assert.equal(frames[3]?.fen, m2.fen);

  assert.equal(nextViewPly({ currentViewPly: null, status: "playing", ply: 1, frameCount: 4, delta: -1 }), null);
  const back1 = nextViewPly({ currentViewPly: null, status: "solved", ply: 3, frameCount: 4, delta: -1 });
  assert.equal(back1, 2);
  const back2 = nextViewPly({ currentViewPly: back1, status: "solved", ply: 3, frameCount: 4, delta: -1 });
  assert.equal(back2, 1);
  const back3 = nextViewPly({ currentViewPly: back2, status: "solved", ply: 3, frameCount: 4, delta: -1 });
  assert.equal(back3, 0);
  const clampedStart = nextViewPly({ currentViewPly: back3, status: "solved", ply: 3, frameCount: 4, delta: -1 });
  assert.equal(clampedStart, 0);

  const forward1 = nextViewPly({ currentViewPly: clampedStart, status: "solved", ply: 3, frameCount: 4, delta: 1 });
  assert.equal(forward1, 1);
  const clampedEnd = nextViewPly({ currentViewPly: 3, status: "solved", ply: 3, frameCount: 4, delta: 1 });
  assert.equal(clampedEnd, 3);
});

test("buildScrubFrames reveals remaining solution moves on failure and anchors at the miss ply", () => {
  const multi = PUZZLE_CATALOG.map(compilePuzzle).find((p) => p.uci.length === 3);
  assert.ok(multi);
  const m0 = playUci(multi.fen, multi.uci[0]);
  const m1 = playUci(m0.fen, multi.uci[1]);
  const played = [
    { fen: m0.fen, last: { from: m0.from, to: m0.to } },
    { fen: m1.fen, last: { from: m1.from, to: m1.to } },
  ];

  // Failed on ply 2: frames should include start, m0, m1, and revealed m2.
  const frames = buildScrubFrames(multi, played, "failed", 2);
  assert.equal(frames.length, 4);
  assert.equal(frames[3]?.fen, multi.endFen);

  const stepIntoSolution = nextViewPly({ currentViewPly: null, status: "failed", ply: 2, frameCount: 4, delta: 1 });
  assert.equal(stepIntoSolution, 3);
  const stepBackToMiss = nextViewPly({
    currentViewPly: stepIntoSolution,
    status: "failed",
    ply: 2,
    frameCount: 4,
    delta: -1,
  });
  assert.equal(stepBackToMiss, 2);
  const stepEarlier = nextViewPly({ currentViewPly: null, status: "failed", ply: 2, frameCount: 4, delta: -1 });
  assert.equal(stepEarlier, 1);
});
