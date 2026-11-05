import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import {
  MAX_CONSECUTIVE_MISSES,
  REVIEW_PASS1_LINES,
  REVIEW_PRESETS,
  reviewChunkOrder,
  estimateRemainingMs,
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

test("pass 1 searches every position with 1 line at the preset depth, clearing the hash once", async () => {
  const script: Script = { 0: flat(0.2), 1: flat(0.2), 2: flat(0.2), 3: flat(0.2), 4: flat(0.2) };
  const fake = fakeEngine(OPENING.fens, script);
  const progress: ReviewProgress[] = [];
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "deep",
    engine: fake.engine,
    chunkOrder: "forward",
    onProgress: (value) => progress.push(value),
  });
  assert.equal(outcome.status, "done");
  assert.equal(fake.log.length, OPENING.fens.length, "flat scores have no best move, so no pass 2");
  assert.equal(fake.maxActive(), 1);
  assert.ok(fake.log.every((entry) => entry.options.lines === REVIEW_PASS1_LINES && entry.options.depth === REVIEW_PRESETS.deep.depth));
  assert.deepEqual(
    fake.log.map((entry) => entry.fen),
    OPENING.fens,
  );
  // SIG-1224: the hash is cleared on the lane's first search only.
  assert.deepEqual(
    fake.log.map((entry) => entry.options.fresh),
    [true, false, false, false, false],
  );
  assert.ok(fake.log.every((entry) => entry.options.lane === 0));
  const dones = progress.map((entry) => entry.done);
  assert.deepEqual(dones, [...dones].sort((a, b) => a - b), "progress never goes backwards");
  assert.equal(progress[progress.length - 1].done, OPENING.fens.length);
  assert.equal(progress[progress.length - 1].total, OPENING.fens.length);
});

test("the default walk order is reverse: later positions first", async () => {
  const script: Script = { 0: flat(0.2), 1: flat(0.2), 2: flat(0.2), 3: flat(0.2), 4: flat(0.2) };
  const fake = fakeEngine(OPENING.fens, script);
  await runReview({ fens: OPENING.fens, moves: OPENING.ucis.map((uci) => ({ uci })), preset: "fast", engine: fake.engine });
  assert.deepEqual(
    fake.log.map((entry) => entry.fen),
    [...OPENING.fens].reverse(),
  );
  assert.equal(reviewChunkOrder("forward"), "forward");
  assert.equal(reviewChunkOrder(undefined), "reverse");
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
    chunkOrder: "forward",
    engine: fake.engine,
    isCancelled: () => fake.log.length >= 2,
    onProgress: (value) => progress.push(value),
  });
  assert.equal(outcome.status, "cancelled");
  assert.equal(fake.log.length, 2);
  // Progress counts positions finished (SIG-1223) and never reaches the total on a cancel.
  const last = progress[progress.length - 1].done;
  assert.ok(last >= 1 && last < OPENING.fens.length, `unexpected progress ${last}`);
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

test("book replies mark the opening moves as textbook", async () => {
  const script: Script = { 0: flat(0.2), 1: flat(0.2), 2: flat(0.2), 3: flat(0.2), 4: flat(0.2) };
  const outcome = await runReview({
    fens: OPENING.fens,
    moves: OPENING.ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: fakeEngine(OPENING.fens, script).engine,
    bookReplies: async () => [[OPENING.ucis[0], "d2d4"], [OPENING.ucis[1]], ["x1x2"]],
  });
  assert.equal(outcome.status, "done");
  if (outcome.status === "done") {
    assert.deepEqual(
      outcome.rows.map((row) => row.label === "book"),
      [true, true, false, false],
    );
  }
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
    chunkOrder: "forward",
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
    chunkOrder: "forward",
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
    chunkOrder: "forward",
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
    chunkOrder: "forward",
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
    chunkOrder: "forward",
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
    chunkOrder: "forward",
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
    chunkOrder: "forward",
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

type Call = { index: number; lines: number; lane: number | undefined; fresh: boolean };

/**
 * Fake with `concurrency` workers. Like a real engine it returns only the lines it was asked
 * for; later positions finish first, so completion order differs from call order.
 */
function concurrentEngine(fens: string[], script: Script, concurrency: number, calls: Call[] = []) {
  let active = 0;
  let maxActive = 0;
  const engine: ReviewEngine = {
    concurrency,
    async analyze(fen, options) {
      const index = fens.indexOf(fen);
      calls.push({ index, lines: options.lines, lane: options.lane, fresh: options.fresh });
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, 12 - index)));
      active -= 1;
      const lines = script[index];
      return lines ? { depth: options.depth, lines: lines.slice(0, options.lines) } : null;
    },
  };
  return { engine, calls, maxActive: () => maxActive };
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

test("each worker gets one contiguous chunk, walked in order, and clears its hash once", async () => {
  const script = swingScript(LONG.fens.length);
  for (const order of ["forward", "reverse"] as const) {
    const run = concurrentEngine(LONG.fens, script, 3);
    const outcome = await runReview(longInput(run.engine, { chunkOrder: order }));
    assert.equal(outcome.status, "done");
    const total = LONG.fens.length;
    const size = Math.ceil(total / 3);
    for (let lane = 0; lane < 3; lane += 1) {
      const mine = run.calls.filter((call) => call.lane === lane);
      const chunk = Array.from({ length: Math.min(total, (lane + 1) * size) - lane * size }, (_, i) => lane * size + i);
      const pass1 = mine.filter((call) => call.lines === 1).map((call) => call.index);
      assert.deepEqual(pass1, order === "forward" ? chunk : [...chunk].reverse(), `lane ${lane} pass 1 (${order})`);
      // Pass 2 stays on the same lane, in the same order, after pass 1.
      const firstPass2 = mine.findIndex((call) => call.lines === 2);
      assert.ok(firstPass2 === -1 || mine.slice(0, firstPass2).every((call) => call.lines === 1));
      assert.ok(mine.every((call) => chunk.includes(call.index)), "a lane never leaves its chunk");
      assert.deepEqual(
        mine.map((call) => call.fresh),
        mine.map((_, i) => i === 0),
        "only the lane's first search clears the hash",
      );
    }
  }
});

test("pass 2 (2 lines) runs only where the played move was pass 1's best", async () => {
  const script = swingScript(LONG.fens.length);
  // Positions 4 and 9: the engine prefers another move than the one played.
  script[4] = [{ whitePawns: 0.2, uci: "a2a3" }, { whitePawns: 0.1, uci: null }];
  script[9] = [{ whitePawns: 0.2, uci: "a2a3" }, { whitePawns: 0.1, uci: null }];
  const run = concurrentEngine(LONG.fens, script, 2);
  const outcome = await runReview(longInput(run.engine));
  assert.equal(outcome.status, "done");
  const second = run.calls.filter((call) => call.lines === 2).map((call) => call.index).sort((a, b) => a - b);
  const expected = LONG.ucis.map((_, i) => i).filter((i) => i !== 4 && i !== 9);
  assert.deepEqual(second, expected, "no pass 2 for the last position (no move played) or for non-best moves");
  assert.equal(run.calls.filter((call) => call.lines === 1).length, LONG.fens.length);
  if (outcome.status === "done") {
    // The pass 2 score carries both lines; positions without it have only line 1.
    assert.equal(outcome.rows.length, LONG.ucis.length);
  }
});

test("a forced move (one legal reply) is never searched with 2 lines", async () => {
  const forcedFen = "k7/8/1K6/8/8/8/8/R7 b - - 0 1";
  const board = new Chess(forcedFen);
  assert.equal(board.moves().length, 1);
  board.move("Kb8");
  const fens = [forcedFen, board.fen()];
  const calls: Call[] = [];
  const engine = concurrentEngine(fens, { 0: [{ whitePawns: 0, uci: "a8b8" }, { whitePawns: -1, uci: null }], 1: flat(0) }, 1, calls).engine;
  await runReview({ fens, moves: [{ uci: "a8b8" }], preset: "fast", engine });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.lines === 1));
});

test("the 2nd line still produces great: pass 2 replaces the score as a whole", async () => {
  const fens = OPENING.fens;
  const script: Script = {};
  fens.forEach((_, index) => {
    // Pass 1 (1 line) sees only the best line; the 2nd line exists only at 2 lines.
    script[index] = [
      { whitePawns: index % 2 === 0 ? 1.5 : -1.5, uci: OPENING.ucis[index] ?? null },
      { whitePawns: index % 2 === 0 ? -1 : 1, uci: null },
    ];
  });
  const run = concurrentEngine(fens, script, 1);
  const outcome = await runReview({ fens, moves: OPENING.ucis.map((uci) => ({ uci })), preset: "fast", engine: run.engine });
  assert.equal(outcome.status, "done");
  if (outcome.status === "done") {
    assert.ok(outcome.rows.some((row) => row.label === "great"), "a 2.5-pawn gap to the 2nd line is a great move");
  }
});

test("concurrent progress is monotonic and ends at the total", async () => {
  const script = swingScript(LONG.fens.length);
  const progress: ReviewProgress[] = [];
  await runReview(longInput(concurrentEngine(LONG.fens, script, 4).engine, { onProgress: (value) => progress.push(value) }));
  assert.equal(progress[0].done, 0);
  assert.equal(progress[progress.length - 1].done, LONG.fens.length);
  const dones = progress.map((entry) => entry.done);
  assert.deepEqual(dones, [...dones].sort((a, b) => a - b), "progress never goes backwards");
  assert.ok(progress.every((entry) => entry.total === LONG.fens.length && entry.done <= entry.total));
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
  assert.ok(calls < LONG.fens.length, `expected an early stop, saw ${calls} calls`);
});

test("a success between misses keeps a concurrent run alive", async () => {
  const script = swingScript(LONG.fens.length);
  script[3] = null;
  script[9] = null;
  const outcome = await runReview(longInput(concurrentEngine(LONG.fens, script, 3).engine));
  assert.equal(outcome.status, "done");
});

test("a cancelled concurrent run returns an index-aligned partial; a resume rescored only what is missing", async () => {
  const script = swingScript(LONG.fens.length);
  const calls: Call[] = [];
  const first = concurrentEngine(LONG.fens, script, 3, calls);
  const cancelled = await runReview(longInput(first.engine, { isCancelled: () => calls.length >= 9 }));
  assert.equal(cancelled.status, "cancelled");
  if (cancelled.status !== "cancelled") {
    return;
  }
  assert.equal(cancelled.partial.length, LONG.fens.length);
  const done1 = cancelled.partial.filter((entry) => entry?.searchedLines === 1).length;
  const done2 = cancelled.partial.filter((entry) => entry?.searchedLines === 2).length;
  assert.ok(done1 + done2 > 0 && done1 + done2 < LONG.fens.length);

  const resumedCalls: Call[] = [];
  const resumed = await runReview(
    longInput(concurrentEngine(LONG.fens, script, 3, resumedCalls).engine, { resume: cancelled.partial }),
  );
  assert.equal(resumed.status, "done");
  const carriedIndexes = new Set(cancelled.partial.flatMap((entry, index) => (entry ? [index] : [])));
  // No carried position is searched again at 1 line.
  assert.ok(resumedCalls.filter((call) => call.lines === 1).every((call) => !carriedIndexes.has(call.index)));
  // Fully scored positions (2 lines) are not searched at all.
  const complete = new Set(cancelled.partial.flatMap((entry, index) => (entry?.searchedLines === 2 ? [index] : [])));
  assert.ok(resumedCalls.every((call) => !complete.has(call.index)));
  const fresh = await runReview(longInput(concurrentEngine(LONG.fens, script, 3).engine));
  if (resumed.status === "done" && fresh.status === "done") {
    assert.deepEqual(resumed.rows, fresh.rows);
  }
});

test("scores without a recorded line count (older partials) are rescored, never mixed in", async () => {
  const script = swingScript(LONG.fens.length);
  const stale = LONG.fens.map((_, index) => ({
    whitePawns: 9,
    bestUci: LONG.ucis[index] ?? null,
    secondWhitePawns: null,
    depth: REVIEW_PRESETS.standard.depth,
  }));
  const calls: Call[] = [];
  const outcome = await runReview(longInput(concurrentEngine(LONG.fens, script, 2, calls).engine, { resume: stale }));
  assert.equal(outcome.status, "done");
  assert.equal(calls.filter((call) => call.lines === 1).length, LONG.fens.length);
});
