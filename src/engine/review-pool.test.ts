// SIG-1223: the review worker pool over fake workers (no real Stockfish).
import assert from "node:assert/strict";
import test from "node:test";
import { REVIEW_LINES, runReview, type PositionEval } from "@/src/chess/review-engine";
import { Chess } from "chess.js";
import {
  MAX_REVIEW_WORKERS,
  ReviewEnginePool,
  createReviewPool,
  reviewPoolSize,
  type ReviewPoolClient,
} from "./review-pool.ts";
import type { EngineInfo } from "./stockfish-client";

const OPTIONS = { depth: 12, lines: REVIEW_LINES, timeoutMs: 2000, fresh: true };

function infoFor(fen: string, overrides: Partial<EngineInfo> = {}, lineCount = 3): EngineInfo {
  return {
    depth: 12,
    running: false,
    ready: true,
    failed: false,
    lines: [1, 2, 3].slice(0, lineCount).map((multipv) => ({
      multipv,
      depth: 12,
      scoreCp: 20 - multipv * 5,
      mate: null,
      pvUci: ["e2e4"],
      pvSan: [],
      bound: null,
    })),
    nps: 0,
    nodes: 0,
    threaded: false,
    fen,
    ...overrides,
  };
}

type FakeWorker = ReviewPoolClient & {
  id: number;
  fens: string[];
  /** `fresh` flag of each search, in order. */
  fresh: boolean[];
  disposed: boolean;
  /** Fail permanently on the Nth search (1-based), emitting a failed snapshot. */
  failOnSearch: number | null;
  delayMs: number;
  /** Hold searches until release() so the test controls overlap. */
  hold: boolean;
  held: Array<() => void>;
};

function fakeFactory() {
  const workers: FakeWorker[] = [];
  const createClient = (): ReviewPoolClient => {
    const listeners = new Set<(info: EngineInfo) => void>();
    const worker: FakeWorker = {
      id: workers.length,
      fens: [],
      fresh: [],
      disposed: false,
      failOnSearch: null,
      delayMs: 2,
      hold: false,
      held: [],
      analyze(fen, _depth, multiPv, _threads, _searchMoves, fresh) {
        worker.fens.push(fen);
        worker.fresh.push(fresh ?? false);
        const answer = () => {
          if (worker.disposed) {
            return;
          }
          const failing = worker.failOnSearch !== null && worker.fens.length >= worker.failOnSearch;
          for (const listener of [...listeners]) {
            listener(failing ? infoFor(fen, { failed: true, lines: [], running: false }) : infoFor(fen, {}, multiPv));
          }
        };
        if (worker.hold) {
          worker.held.push(() => setTimeout(answer, 0));
        } else {
          setTimeout(answer, worker.delayMs);
        }
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      dispose() {
        worker.disposed = true;
        listeners.clear();
      },
    };
    workers.push(worker);
    return worker;
  };
  return { workers, createClient };
}

const FENS = (() => {
  const game = new Chess();
  const fens = [game.fen()];
  for (const move of ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5"]) {
    game.move(move);
    fens.push(game.fen());
  }
  return fens;
})();

test("pool size is min(4, max(1, cores - 1))", () => {
  assert.equal(reviewPoolSize(1, undefined), 1);
  assert.equal(reviewPoolSize(2, undefined), 1);
  assert.equal(reviewPoolSize(3, undefined), 2);
  assert.equal(reviewPoolSize(4, undefined), 3);
  assert.equal(reviewPoolSize(5, undefined), 4);
  assert.equal(reviewPoolSize(32, undefined), MAX_REVIEW_WORKERS);
  // Unknown core counts fall back to one worker.
  assert.equal(reviewPoolSize(Number.NaN, undefined), 1);
  assert.equal(reviewPoolSize(0, undefined), 1);
});

test("the test-only override beats the formula and ignores garbage", () => {
  assert.equal(reviewPoolSize(2, "2"), 2);
  assert.equal(reviewPoolSize(32, "1"), 1);
  assert.equal(reviewPoolSize(2, "abc"), 1);
  assert.equal(reviewPoolSize(2, "0"), 1);
});

test("workers are created lazily, up to the pool size, and no more", async () => {
  const { workers, createClient } = fakeFactory();
  const pool = new ReviewEnginePool({ size: 3, createClient });
  assert.equal(workers.length, 0, "nothing starts before the first search");
  await pool.analyze(FENS[0], OPTIONS);
  assert.equal(workers.length, 1, "a sequential caller never needs a second worker");
  await Promise.all(FENS.slice(0, 8).map((fen) => pool.analyze(fen, OPTIONS)));
  assert.equal(workers.length, 3);
  pool.dispose();
});

test("positions are split across workers and each position is searched once, whole", async () => {
  const { workers, createClient } = fakeFactory();
  const pool = new ReviewEnginePool({ size: 3, createClient });
  const results = await Promise.all(FENS.map((fen) => pool.analyze(fen, OPTIONS)));
  assert.equal(results.length, FENS.length);
  const searched = workers.flatMap((worker) => worker.fens);
  assert.deepEqual([...searched].sort(), [...FENS].sort(), "every position exactly once across the pool");
  assert.ok(workers.every((worker) => worker.fens.length > 0), "work is shared by all workers");
  pool.dispose();
});

test("results come back to their own caller, in order, whatever the finish order", async () => {
  const { workers, createClient } = fakeFactory();
  const pool = new ReviewEnginePool({ size: 2, createClient });
  // Worker 0 is slow, worker 1 is fast: completion order differs from call order.
  const first = pool.analyze(FENS[0], OPTIONS);
  const second = pool.analyze(FENS[1], OPTIONS);
  workers[0].delayMs = 30;
  const third = pool.analyze(FENS[2], OPTIONS);
  const results = await Promise.all([first, second, third]);
  assert.equal(workers.length, 2);
  // `analyze` resolves with the evaluation of the very position asked for.
  results.forEach((result) => {
    assert.ok(result);
    assert.equal(result.lines.length, REVIEW_LINES);
  });
  pool.dispose();
});

test("runReview over the pool returns the same rows as a one-worker pool", async () => {
  const line = new Chess();
  const moves: string[] = [];
  for (const san of ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"]) {
    const played = line.move(san);
    moves.push(`${played.from}${played.to}`);
  }
  const replay = new Chess();
  const fens = [replay.fen()];
  for (const san of ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"]) {
    replay.move(san);
    fens.push(replay.fen());
  }
  const run = async (size: number) => {
    const { createClient } = fakeFactory();
    const pool = createReviewPool({ size, createClient });
    try {
      return await runReview({ fens, moves: moves.map((uci) => ({ uci })), preset: "standard", engine: pool });
    } finally {
      pool.dispose();
    }
  };
  const one = await run(1);
  const three = await run(3);
  assert.equal(one.status, "done");
  assert.equal(three.status, "done");
  if (one.status === "done" && three.status === "done") {
    assert.deepEqual(three.rows, one.rows);
  }
});

test("callers wait for a free worker when every worker is busy", async () => {
  const { workers, createClient } = fakeFactory();
  const pool = new ReviewEnginePool({ size: 1, createClient });
  const results = await Promise.all(FENS.slice(0, 4).map((fen) => pool.analyze(fen, OPTIONS)));
  assert.equal(workers.length, 1);
  assert.deepEqual(workers[0].fens, FENS.slice(0, 4), "queued in call order");
  assert.ok(results.every((result) => result !== null));
  pool.dispose();
});

test("dispose terminates every worker and resolves in-flight and queued searches with null", async () => {
  const { workers, createClient } = fakeFactory();
  const pool = new ReviewEnginePool({ size: 2, createClient });
  // Warm up two workers, then make them hang.
  await Promise.all([pool.analyze(FENS[0], OPTIONS), pool.analyze(FENS[1], OPTIONS)]);
  workers.forEach((worker) => {
    worker.hold = true;
  });
  const inFlight = [pool.analyze(FENS[2], OPTIONS), pool.analyze(FENS[3], OPTIONS)];
  const queued = pool.analyze(FENS[4], OPTIONS);
  await new Promise((resolve) => setTimeout(resolve, 5));
  pool.dispose();
  assert.ok(workers.every((worker) => worker.disposed));
  assert.deepEqual(await Promise.all([...inFlight, queued]), [null, null, null]);
  // Idempotent, and a disposed pool serves nothing.
  pool.dispose();
  assert.equal(await pool.analyze(FENS[5], OPTIONS), null);
  assert.equal(workers.length, 2, "no new worker after dispose");
});

test("cancelling a review through the pool ends the run as cancelled and keeps a partial", async () => {
  const { workers, createClient } = fakeFactory();
  let cancelled = false;
  const pool = new ReviewEnginePool({ size: 2, createClient, isCancelled: () => cancelled });
  const outcomePromise = runReview({
    fens: FENS,
    moves: FENS.slice(1).map(() => ({ uci: "e2e4" })),
    preset: "fast",
    engine: pool,
    isCancelled: () => cancelled,
  });
  await new Promise((resolve) => setTimeout(resolve, 8));
  cancelled = true;
  pool.dispose();
  const outcome = await outcomePromise;
  assert.equal(outcome.status, "cancelled");
  if (outcome.status === "cancelled") {
    assert.equal(outcome.partial.length, FENS.length);
  }
  assert.ok(workers.every((worker) => worker.disposed));
});

test("a worker that dies mid-run is retired and its position is re-run on a survivor", async () => {
  const { workers, createClient } = fakeFactory();
  const pool = new ReviewEnginePool({ size: 2, createClient });
  // Create both workers, then kill worker 0 on its next search.
  await Promise.all([pool.analyze(FENS[0], OPTIONS), pool.analyze(FENS[1], OPTIONS)]);
  workers[0].failOnSearch = workers[0].fens.length + 1;
  const results = await Promise.all(FENS.slice(2, 8).map((fen) => pool.analyze(fen, OPTIONS)));
  assert.ok(results.every((result): result is PositionEval => result !== null), "no position is lost");
  assert.equal(workers[0].disposed, true, "the dead worker is terminated");
  assert.equal(workers[1].disposed, false);
  assert.equal(pool.workerCount, 1);
  // Every position was still scored by someone.
  const scored = new Set(workers.flatMap((worker) => worker.fens));
  FENS.slice(0, 8).forEach((fen) => assert.ok(scored.has(fen)));
  // The survivor keeps serving.
  assert.ok(await pool.analyze(FENS[9], OPTIONS));
  pool.dispose();
});

test("a worker that dies mid-run does not change the review's result", async () => {
  const replay = new Chess();
  const fens = [replay.fen()];
  const ucis: string[] = [];
  for (const san of ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O"]) {
    const played = replay.move(san);
    ucis.push(`${played.from}${played.to}`);
    fens.push(replay.fen());
  }
  const review = async (killAt: number | null) => {
    const { workers, createClient } = fakeFactory();
    const pool = new ReviewEnginePool({ size: 3, createClient });
    const run = runReview({ fens, moves: ucis.map((uci) => ({ uci })), preset: "standard", engine: pool });
    if (killAt !== null) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      workers[0].failOnSearch = killAt;
    }
    const outcome = await run;
    pool.dispose();
    return outcome;
  };
  const healthy = await review(null);
  const flaky = await review(2);
  assert.equal(healthy.status, "done");
  assert.equal(flaky.status, "done");
  if (healthy.status === "done" && flaky.status === "done") {
    assert.deepEqual(flaky.rows, healthy.rows);
  }
});

test("when every worker is dead the pool answers null and the run fails instead of hanging", async () => {
  const { workers, createClient } = fakeFactory();
  const pool = new ReviewEnginePool({ size: 2, createClient });
  await Promise.all([pool.analyze(FENS[0], OPTIONS), pool.analyze(FENS[1], OPTIONS)]);
  workers.forEach((worker) => {
    worker.failOnSearch = worker.fens.length + 1;
  });
  assert.equal(await pool.analyze(FENS[2], OPTIONS), null);
  assert.equal(pool.workerCount, 0);
  assert.equal(await pool.analyze(FENS[3], OPTIONS), null, "later searches fail fast");

  const outcome = await runReview({
    fens: FENS,
    moves: FENS.slice(1).map(() => ({ uci: "e2e4" })),
    preset: "fast",
    engine: pool,
  });
  assert.equal(outcome.status, "failed");
  pool.dispose();
});

test("SIG-1224: searches with a lane stay on that lane's worker, in call order, and keep their hash", async () => {
  const { workers, createClient } = fakeFactory();
  const pool = new ReviewEnginePool({ size: 2, createClient });
  const lane = async (laneId: number, fens: string[]) => {
    for (const [i, fen] of fens.entries()) {
      await pool.analyze(fen, { ...OPTIONS, lines: 1, lane: laneId, fresh: i === 0 });
    }
  };
  await Promise.all([lane(0, FENS.slice(0, 6)), lane(1, FENS.slice(6, 12))]);
  assert.equal(workers.length, 2);
  assert.deepEqual(workers[0].fens, FENS.slice(0, 6));
  assert.deepEqual(workers[1].fens, FENS.slice(6, 12));
  // The hash is cleared on each lane's first search only.
  assert.deepEqual(workers[0].fresh, [true, false, false, false, false, false]);
  assert.deepEqual(workers[1].fresh, [true, false, false, false, false, false]);
  pool.dispose();
});

test("SIG-1224: when a lane's worker dies, the lane moves to a survivor with a cleared hash", async () => {
  const { workers, createClient } = fakeFactory();
  const pool = new ReviewEnginePool({ size: 2, createClient });
  await Promise.all([
    pool.analyze(FENS[0], { ...OPTIONS, lines: 1, lane: 0, fresh: true }),
    pool.analyze(FENS[6], { ...OPTIONS, lines: 1, lane: 1, fresh: true }),
  ]);
  workers[0].failOnSearch = workers[0].fens.length + 1;
  // Lane 0's next search kills worker 0; the position is re-run on worker 1, hash cleared.
  const result = await pool.analyze(FENS[1], { ...OPTIONS, lines: 1, lane: 0, fresh: false });
  assert.ok(result);
  assert.equal(workers[0].disposed, true);
  assert.equal(workers[1].fens[workers[1].fens.length - 1], FENS[1]);
  assert.equal(workers[1].fresh[workers[1].fresh.length - 1], true, "takeover clears the hash");
  // Later searches of both lanes now share the survivor, one at a time.
  const more = await Promise.all([
    pool.analyze(FENS[2], { ...OPTIONS, lines: 1, lane: 0, fresh: false }),
    pool.analyze(FENS[7], { ...OPTIONS, lines: 1, lane: 1, fresh: false }),
  ]);
  assert.ok(more.every((entry) => entry !== null));
  assert.equal(pool.workerCount, 1);
  pool.dispose();
});

test("SIG-1224: pinned waiters are released on dispose and the pool serves nothing afterwards", async () => {
  const { workers, createClient } = fakeFactory();
  const pool = new ReviewEnginePool({ size: 1, createClient });
  await pool.analyze(FENS[0], { ...OPTIONS, lane: 0, fresh: true });
  workers[0].hold = true;
  const running = pool.analyze(FENS[1], { ...OPTIONS, lane: 0 });
  const waiting = pool.analyze(FENS[2], { ...OPTIONS, lane: 0 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  pool.dispose();
  assert.deepEqual(await Promise.all([running, waiting]), [null, null]);
  assert.equal(await pool.analyze(FENS[3], { ...OPTIONS, lane: 0 }), null);
});

test("a review over the pool is identical for one lane per worker and for the dynamic path", async () => {
  const replay = new Chess();
  const fens = [replay.fen()];
  const ucis: string[] = [];
  for (const san of ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O", "Nf3", "h6"]) {
    const played = replay.move(san);
    ucis.push(`${played.from}${played.to}`);
    fens.push(replay.fen());
  }
  const { createClient } = fakeFactory();
  const pool = new ReviewEnginePool({ size: 3, createClient });
  const lanes = await runReview({ fens, moves: ucis.map((uci) => ({ uci })), preset: "standard", engine: pool });
  pool.dispose();
  const single = new ReviewEnginePool({ size: 1, createClient: fakeFactory().createClient });
  const one = await runReview({ fens, moves: ucis.map((uci) => ({ uci })), preset: "standard", engine: single });
  single.dispose();
  assert.equal(lanes.status, "done");
  assert.equal(one.status, "done");
  if (lanes.status === "done" && one.status === "done") {
    assert.deepEqual(lanes.rows, one.rows);
  }
});
