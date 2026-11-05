import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import {
  MAX_CONSECUTIVE_MISSES,
  REVIEW_LINES,
  REVIEW_PRESETS,
  estimateRemainingMs,
  moveWeights,
  runReview,
  type AnalyzeOptions,
  type EvalLine,
  type PositionEval,
  type ReviewEngine,
  type ReviewProgress,
} from "./review-engine.ts";
import { buildReviewReport } from "./review-report.ts";

function lineFor(san: string[]): { fens: string[]; ucis: string[] } {
  const game = new Chess();
  const fens = [game.fen()];
  const ucis: string[] = [];
  for (const move of san) {
    const played = game.move(move);
    ucis.push(`${played.from}${played.to}${played.promotion ?? ""}`);
    fens.push(game.fen());
  }
  return { fens, ucis };
}

const OPENING = lineFor(["e4", "e5", "Nf3", "Nc6"]);

type Script = Record<number, EvalLine[] | null>;

/** Deterministic engine: scores come from `script[index]` (position index in OPENING.fens). */
function fakeEngine(fens: string[], script: Script, log: Array<{ fen: string; options: AnalyzeOptions }> = []) {
  let active = 0;
  let maxActive = 0;
  const engine: ReviewEngine = {
    async analyze(fen, options) {
      log.push({ fen, options });
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      const index = fens.indexOf(fen);
      const lines = script[index];
      if (!lines) {
        return null;
      }
      const evaluation: PositionEval = { depth: options.depth, lines };
      return evaluation;
    },
  };
  return { engine, log, maxActive: () => maxActive };
}

function flat(value: number, uci: string | null = null): EvalLine[] {
  return [{ whitePawns: value, uci }];
}

test("every position is analysed sequentially with 3 lines at the preset depth", async () => {
  const script: Script = { 0: flat(0.2), 1: flat(0.2), 2: flat(0.2), 3: flat(0.2), 4: flat(0.2) };
  const fake = fakeEngine(OPENING.fens, script);
  const progress: ReviewProgress[] = [];
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "deep",
    engine: fake.engine,
    onProgress: (value) => progress.push(value),
  });
  assert.equal(outcome.status, "done");
  assert.equal(fake.log.length, OPENING.fens.length);
  assert.equal(fake.maxActive(), 1);
  assert.ok(fake.log.every((entry) => entry.options.lines === REVIEW_LINES && entry.options.depth === REVIEW_PRESETS.deep.depth));
  assert.deepEqual(
    fake.log.map((entry) => entry.options.fresh),
    [true, true, true, true, true],
  );
  assert.equal(progress[progress.length - 1].done, OPENING.fens.length);
  assert.equal(progress[progress.length - 1].total, OPENING.fens.length);
});

test("presets map to depth 10 / 12 / 16", () => {
  assert.deepEqual(
    [REVIEW_PRESETS.fast.depth, REVIEW_PRESETS.standard.depth, REVIEW_PRESETS.deep.depth],
    [10, 12, 16],
  );
});

test("the second line decides great vs best", async () => {
  const run = async (second: number) => {
    const script: Script = {
      0: [
        { whitePawns: 0.3, uci: OPENING.ucis[0] },
        { whitePawns: second, uci: "d2d4" },
        { whitePawns: second, uci: "c2c4" },
      ],
      1: flat(0.3),
      2: flat(0.3),
      3: flat(0.3),
      4: flat(0.3),
    };
    const outcome = await runReview({
      fens: OPENING.fens,
      moves: OPENING.ucis.map((uci) => ({ uci })),
      preset: "standard",
      engine: fakeEngine(OPENING.fens, script).engine,
    });
    assert.equal(outcome.status, "done");
    return outcome.status === "done" ? outcome.rows[0].label : null;
  };
  assert.equal(await run(-1.5), "great");
  assert.equal(await run(0.2), "best");
});

test("a forced move is labelled forced, so the report counts it apart and skips it", async () => {
  const forcedFen = "6k1/8/8/8/8/2B5/5PPP/4r1K1 w - - 0 1";
  const game = new Chess(forcedFen);
  game.move("Bxe1");
  const fens = [forcedFen, game.fen()];
  const script: Script = { 0: flat(-3, "c3e1"), 1: flat(-3) };
  const outcome = await runReview({
    fens,
    moves: [{ uci: "c3e1" }],
    preset: "fast",
    engine: fakeEngine(fens, script).engine,
  });
  assert.equal(outcome.status, "done");
  if (outcome.status !== "done") {
    return;
  }
  assert.equal(outcome.rows.length, 1);
  assert.equal(outcome.rows[0].forced, true);
  assert.equal(outcome.rows[0].label, "forced");
  const report = buildReviewReport(outcome.rows, {});
  assert.equal(report.white.accuracy, null);
  assert.equal(report.white.acpl, null);
  assert.equal(Object.values(report.white.counts).reduce((sum, count) => sum + count, 0), 0);
  assert.equal(report.white.forced, 1);
});

test("a position the engine could not score is skipped without breaking the rest", async () => {
  // Position 2 was preempted (e.g. by Show-threat) and produced nothing before its timeout.
  const script: Script = { 0: flat(0.2), 1: flat(0.2), 2: null, 3: flat(0.2), 4: flat(0.2) };
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: fakeEngine(OPENING.fens, script).engine,
  });
  assert.equal(outcome.status, "done");
  if (outcome.status === "done") {
    assert.deepEqual(
      outcome.rows.map((row) => row.index),
      [0, 3],
    );
  }
});

test("a preempted analysis that resumes late still yields its result", async () => {
  const script: Script = { 0: flat(0.2), 1: flat(0.2), 2: flat(0.2), 3: flat(0.2), 4: flat(0.2) };
  const inner = fakeEngine(OPENING.fens, script).engine;
  let calls = 0;
  const engine: ReviewEngine = {
    async analyze(fen, options) {
      calls += 1;
      if (calls === 3) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return inner.analyze(fen, options);
    },
  };
  const outcome = await runReview({ fens: OPENING.fens, moves: OPENING.ucis.map((uci) => ({ uci })), preset: "standard", engine });
  assert.equal(outcome.status, "done");
  if (outcome.status === "done") {
    assert.equal(outcome.rows.length, 4);
  }
});

test("cancelling stops the engine calls and reports partial progress", async () => {
  const script: Script = { 0: flat(0), 1: flat(0), 2: flat(0), 3: flat(0), 4: flat(0) };
  const fake = fakeEngine(OPENING.fens, script);
  const progress: ReviewProgress[] = [];
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: fake.engine,
    isCancelled: () => fake.log.length >= 2,
    onProgress: (value) => progress.push(value),
  });
  assert.equal(outcome.status, "cancelled");
  assert.equal(fake.log.length, 2);
  // Progress counts positions finished (SIG-1223), including the one in flight when the cancel was seen.
  assert.equal(progress[progress.length - 1].done, 2);
});

test("volatile stretches weigh more than quiet ones", async () => {
  const script: Script = { 0: flat(0), 1: flat(0), 2: flat(0), 3: flat(9), 4: flat(9) };
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: fakeEngine(OPENING.fens, script).engine,
  });
  assert.equal(outcome.status, "done");
  if (outcome.status === "done") {
    const weights = outcome.rows.map((row) => row.weight ?? 0);
    assert.equal(weights.length, 4);
    assert.ok(weights[2] > weights[0]);
  }
});

test("SIG-1225: book moves are labelled book, never scored, and the engine starts at the last book position", async () => {
  const script: Script = { 0: flat(0.2), 1: flat(0.2), 2: flat(0.2), 3: flat(0.2), 4: flat(0.2) };
  const fake = fakeEngine(OPENING.fens, script);
  const progress: ReviewProgress[] = [];
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: fake.engine,
    book: async () => ({ plies: 2 }),
    onProgress: (value) => progress.push(value),
  });
  assert.equal(outcome.status, "done");
  // Positions 2, 3 and 4 only: position 2 grades the first out-of-book move.
  assert.deepEqual(
    fake.log.map((entry) => entry.fen).sort(),
    OPENING.fens.slice(2).sort(),
  );
  assert.ok(progress.every((entry) => entry.total === 3));
  assert.equal(progress[progress.length - 1].done, 3);
  if (outcome.status === "done") {
    assert.deepEqual(
      outcome.rows.map((row) => row.label === "book"),
      [true, true, false, false],
    );
    const [first, second, third] = outcome.rows;
    assert.equal(first.beforePawns, null);
    assert.equal(first.afterPawns, null);
    assert.equal(second.afterPawns, null);
    assert.notEqual(third.beforePawns, null);
    assert.equal(first.index, 0);
    assert.equal(third.index, 2);
  }
});

test("SIG-1225: a game that is book from start to finish makes no engine call", async () => {
  const fake = fakeEngine(OPENING.fens, {});
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "fast",
    engine: fake.engine,
    book: async () => ({ plies: OPENING.ucis.length }),
  });
  assert.equal(outcome.status, "done");
  assert.equal(fake.log.length, 0);
  if (outcome.status === "done") {
    assert.equal(outcome.rows.length, OPENING.ucis.length);
    assert.ok(outcome.rows.every((row) => row.label === "book"));
  }
});

test("SIG-1225: an unavailable book (null or a rejection) scores every position", async () => {
  const script: Script = { 0: flat(0.2), 1: flat(0.2), 2: flat(0.2), 3: flat(0.2), 4: flat(0.2) };
  for (const book of [async () => null, async () => Promise.reject(new Error("429"))]) {
    const fake = fakeEngine(OPENING.fens, script);
    const outcome = await runReview({
      fens: OPENING.fens,
      moves: OPENING.ucis.map((uci) => ({ uci })),
      preset: "fast",
      engine: fake.engine,
      book,
    });
    assert.equal(outcome.status, "done");
    assert.equal(fake.log.length, OPENING.fens.length);
    if (outcome.status === "done") {
      assert.ok(outcome.rows.every((row) => row.label !== "book" && row.beforePawns != null));
    }
  }
});

test("SIG-1225: the book is resolved before the first engine call, and a cancel during it ends the run", async () => {
  const order: string[] = [];
  const fake = fakeEngine(OPENING.fens, { 0: flat(0), 1: flat(0), 2: flat(0), 3: flat(0), 4: flat(0) }, []);
  const engine: ReviewEngine = {
    analyze(fen, options) {
      order.push("engine");
      return fake.engine.analyze(fen, options);
    },
  };
  await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "fast",
    engine,
    book: async () => {
      order.push("book");
      return { plies: 1 };
    },
  });
  assert.equal(order[0], "book");

  let cancelled = false;
  const fake2 = fakeEngine(OPENING.fens, {});
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "fast",
    engine: fake2.engine,
    isCancelled: () => cancelled,
    book: async () => {
      cancelled = true;
      return { plies: 1 };
    },
  });
  assert.equal(outcome.status, "cancelled");
  assert.equal(fake2.log.length, 0);
});

test("SIG-1225: unscored book plies add no swing to the first scored moves' weights", () => {
  const scored = { whitePawns: 3, bestUci: null, secondWhitePawns: null };
  const withBook = moveWeights([null, null, scored, scored, scored, scored, scored]);
  const flatScores = moveWeights([scored, scored, scored, scored, scored, scored, scored]);
  assert.deepEqual(withBook, flatScores);
});

test("the remaining-time estimate uses the measured pace", () => {
  assert.equal(estimateRemainingMs({ done: 0, total: 10, elapsedMs: 0 }), null);
  assert.equal(estimateRemainingMs({ done: 4, total: 10, elapsedMs: 8000 }), 12_000);
  assert.equal(estimateRemainingMs({ done: 10, total: 10, elapsedMs: 8000 }), 0);
});

test("rows carry what an explanation needs: played move, engine line and evaluations", async () => {
  const script: Script = {
    0: [{ whitePawns: 0.4, uci: "d2d4", pv: ["d2d4", "d7d5"] }, { whitePawns: 0.3, uci: "e2e4" }],
    1: flat(0.1),
    2: flat(0.1),
    3: flat(0.1),
    4: flat(0.1),
  };
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: fakeEngine(OPENING.fens, script).engine,
  });
  assert.equal(outcome.status, "done");
  if (outcome.status === "done") {
    const first = outcome.rows[0];
    assert.equal(first.playedUci, "e2e4");
    assert.deepEqual(first.bestPv, ["d2d4", "d7d5"]);
    assert.equal(first.beforePawns, 0.4);
    assert.equal(first.afterPawns, 0.1);
    // A line without a continuation falls back to its first move.
    assert.deepEqual(outcome.rows[1].bestPv, []);
  }
});

test("a dead engine ends the run after a few positions instead of waiting on every timeout", async () => {
  const log: string[] = [];
  const engine: ReviewEngine = {
    async analyze(fen) {
      log.push(fen);
      return null;
    },
  };
  const outcome = await runReview({ fens: OPENING.fens, moves: OPENING.ucis.map((uci) => ({ uci })), preset: "fast", engine });
  assert.equal(outcome.status, "failed");
  // One retry per position: each of the 3 misses costs 2 analyze calls.
  assert.equal(log.length, MAX_CONSECUTIVE_MISSES * 2);
});

test("a single missed position does not fail the run", async () => {
  const script: Script = { 0: flat(0.2), 1: null, 2: flat(0.2), 3: null, 4: flat(0.2) };
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "fast",
    engine: fakeEngine(OPENING.fens, script).engine,
  });
  assert.equal(outcome.status, "done");
});

test("a cancelled run keeps its scored positions as a partial", async () => {
  const script: Script = { 0: flat(0), 1: flat(0), 2: flat(0), 3: flat(0), 4: flat(0) };
  const fake = fakeEngine(OPENING.fens, script);
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: fake.engine,
    isCancelled: () => fake.log.length >= 2,
  });
  assert.equal(outcome.status, "cancelled");
  if (outcome.status === "cancelled") {
    assert.equal(outcome.partial.length, OPENING.fens.length);
    assert.ok(outcome.partial[0]);
    assert.ok(outcome.partial[1]);
    assert.equal(outcome.partial[2], null);
  }
});

test("a failed run keeps its scored prefix as a partial", async () => {
  const script: Script = { 0: flat(0.2), 1: flat(0.2), 2: null, 3: null, 4: null };
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "fast",
    engine: fakeEngine(OPENING.fens, script).engine,
  });
  assert.equal(outcome.status, "failed");
  if (outcome.status === "failed") {
    assert.equal(outcome.partial.length, OPENING.fens.length);
    assert.ok(outcome.partial[0]);
    assert.ok(outcome.partial[1]);
  }
});

test("resuming scores only the remainder and matches a fresh run", async () => {
  const script: Script = { 0: flat(0.2), 1: flat(0.2), 2: flat(0.2), 3: flat(0.2), 4: flat(0.2) };
  const interrupted = fakeEngine(OPENING.fens, script);
  const cancelled = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: interrupted.engine,
    isCancelled: () => interrupted.log.length >= 2,
  });
  assert.equal(cancelled.status, "cancelled");
  if (cancelled.status !== "cancelled") {
    return;
  }

  const resumedLog: Array<{ fen: string; options: AnalyzeOptions }> = [];
  const resumed = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: fakeEngine(OPENING.fens, script, resumedLog).engine,
    resume: cancelled.partial,
  });
  assert.equal(resumed.status, "done");
  // Only the 3 unscored positions hit the engine; the scored prefix is reused.
  assert.equal(resumedLog.length, 3);
  assert.deepEqual(
    resumedLog.map((entry) => entry.fen),
    OPENING.fens.slice(2),
  );

  const fresh = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: fakeEngine(OPENING.fens, script).engine,
  });
  assert.equal(fresh.status, "done");
  if (resumed.status === "done" && fresh.status === "done") {
    assert.deepEqual(resumed.rows, fresh.rows);
  }
});

test("resume entries at a stale depth are rescored", async () => {
  const script: Script = { 0: flat(0.2), 1: flat(0.2), 2: flat(0.2), 3: flat(0.2), 4: flat(0.2) };
  const interrupted = fakeEngine(OPENING.fens, script);
  const cancelled = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: interrupted.engine,
    isCancelled: () => interrupted.log.length >= 2,
  });
  assert.equal(cancelled.status, "cancelled");
  if (cancelled.status !== "cancelled" || !cancelled.partial[0]) {
    return;
  }
  const stale = [...cancelled.partial];
  const first = stale[0];
  if (!first) {
    return;
  }
  stale[0] = { ...first, depth: REVIEW_PRESETS.standard.depth + 1 };

  const resumedLog: Array<{ fen: string; options: AnalyzeOptions }> = [];
  const resumed = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: fakeEngine(OPENING.fens, script, resumedLog).engine,
    resume: stale,
  });
  assert.equal(resumed.status, "done");
  // The stale entry plus the 3 unscored positions are analysed.
  assert.ok(resumedLog.some((entry) => entry.fen === OPENING.fens[0]));
  assert.equal(resumedLog.length, 4);
});

// --- SIG-1223: concurrent scoring (engine.concurrency > 1) -------------------

const LONG = lineFor(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O"]);

/** Scores vary by position so a mixed-up index shows in the grades. */
function swingScript(count: number): Script {
  const script: Script = {};
  for (let index = 0; index < count; index += 1) {
    script[index] = [
      { whitePawns: (index % 5) * 0.4 - 0.6, uci: LONG.ucis[index] ?? null },
      { whitePawns: (index % 5) * 0.4 - 0.9, uci: null },
      { whitePawns: (index % 5) * 0.4 - 1.2, uci: null },
    ];
  }
  return script;
}

/** Fake with `concurrency` workers; later positions finish first, so completion order is reversed. */
function concurrentEngine(fens: string[], script: Script, concurrency: number, log: string[] = []) {
  let active = 0;
  let maxActive = 0;
  const engine: ReviewEngine = {
    concurrency,
    async analyze(fen, options) {
      log.push(fen);
      active += 1;
      maxActive = Math.max(maxActive, active);
      const index = fens.indexOf(fen);
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, 12 - index)));
      active -= 1;
      const lines = script[index];
      return lines ? { depth: options.depth, lines } : null;
    },
  };
  return { engine, log, maxActive: () => maxActive };
}

const longInput = (engine: ReviewEngine, extra: Partial<Parameters<typeof runReview>[0]> = {}) => ({
  fens: LONG.fens,
  moves: LONG.ucis.map((uci) => ({ uci })),
  preset: "standard" as const,
  engine,
  ...extra,
});

test("concurrent scoring keeps several positions in flight and grades exactly like the sequential run", async () => {
  const script = swingScript(LONG.fens.length);
  const sequential = await runReview(longInput(concurrentEngine(LONG.fens, script, 1).engine));
  const parallel = concurrentEngine(LONG.fens, script, 3);
  const outcome = await runReview(longInput(parallel.engine));
  assert.equal(sequential.status, "done");
  assert.equal(outcome.status, "done");
  assert.equal(parallel.maxActive(), 3);
  if (sequential.status === "done" && outcome.status === "done") {
    assert.deepEqual(outcome.rows, sequential.rows);
  }
});

test("concurrent progress counts finished positions and ends at the total", async () => {
  const script = swingScript(LONG.fens.length);
  const progress: ReviewProgress[] = [];
  await runReview(longInput(concurrentEngine(LONG.fens, script, 4).engine, { onProgress: (value) => progress.push(value) }));
  assert.equal(progress[0].done, 0);
  assert.equal(progress[progress.length - 1].done, LONG.fens.length);
  const dones = progress.map((entry) => entry.done);
  assert.deepEqual(dones, [...dones].sort((a, b) => a - b), "progress never goes backwards");
  assert.ok(progress.every((entry) => entry.total === LONG.fens.length));
});

test("a dead engine still fails fast under concurrency", async () => {
  let calls = 0;
  const engine: ReviewEngine = {
    concurrency: 4,
    async analyze() {
      calls += 1;
      return null;
    },
  };
  const outcome = await runReview(longInput(engine));
  assert.equal(outcome.status, "failed");
  // Lanes stop picking up work once the give-up threshold is reached: nowhere
  // near one attempt (plus retry) per position.
  assert.ok(calls < LONG.fens.length, `expected an early stop, saw ${calls} calls`);
});

test("a success between misses keeps a concurrent run alive", async () => {
  const script = swingScript(LONG.fens.length);
  script[3] = null;
  script[9] = null;
  const outcome = await runReview(longInput(concurrentEngine(LONG.fens, script, 3).engine));
  assert.equal(outcome.status, "done");
});

test("a cancelled concurrent run returns an index-aligned partial that a resume completes", async () => {
  const script = swingScript(LONG.fens.length);
  const first = concurrentEngine(LONG.fens, script, 3);
  const cancelled = await runReview(longInput(first.engine, { isCancelled: () => first.log.length >= 7 }));
  assert.equal(cancelled.status, "cancelled");
  if (cancelled.status !== "cancelled") {
    return;
  }
  assert.equal(cancelled.partial.length, LONG.fens.length);
  const scoredBefore = cancelled.partial.filter((entry) => entry != null).length;
  assert.ok(scoredBefore > 0 && scoredBefore < LONG.fens.length);

  const resumedLog: string[] = [];
  const resumed = await runReview(
    longInput(concurrentEngine(LONG.fens, script, 3, resumedLog).engine, { resume: cancelled.partial }),
  );
  assert.equal(resumed.status, "done");
  // Only the holes are rescored.
  assert.equal(resumedLog.length, LONG.fens.length - scoredBefore);
  const fresh = await runReview(longInput(concurrentEngine(LONG.fens, script, 1).engine));
  if (resumed.status === "done" && fresh.status === "done") {
    assert.deepEqual(resumed.rows, fresh.rows);
  }
});
