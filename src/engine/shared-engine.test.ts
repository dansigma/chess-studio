import assert from "node:assert/strict";
import test from "node:test";
import {
  acquire,
  resetSharedEngineForTests,
  type EngineSlot,
  type SharedEngineLease,
} from "./shared-engine.ts";
import type { EngineInfo } from "./stockfish-client.ts";

type FakeInstance = {
  url: string;
  sent: string[];
  terminated: boolean;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  emit: (data: string) => void;
  fail: () => void;
  terminate: () => void;
  postMessage: (msg: string) => void;
};

const instances: FakeInstance[] = [];

class FakeWorker {
  sent: string[] = [];
  terminated = false;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    instances.push(this as unknown as FakeInstance);
  }

  postMessage(msg: string): void {
    this.sent.push(msg);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(data: string): void {
    this.onmessage?.({ data });
  }

  fail(): void {
    this.onerror?.();
  }
}

(globalThis as { Worker?: unknown }).Worker = FakeWorker;

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FEN_A = START_FEN;
const FEN_B = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const FEN_C = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

function setup(): void {
  resetSharedEngineForTests();
  instances.length = 0;
}

function worker(): FakeInstance {
  return instances[instances.length - 1];
}

/** Drive the worker until the pending analyze is actively searching. */
function driveToSearch(w: FakeInstance): void {
  w.emit("uciok");
  w.emit("readyok");
  w.emit("readyok");
}

/** Complete the SIG-850 barrier cycle for a preempting analyze. */
function releaseBarrier(w: FakeInstance): void {
  w.emit("bestmove e2e4");
  w.emit("readyok");
}

function activeSearch(lease: SharedEngineLease, fen: string): void {
  lease.analyze(fen, 12, 1, 1);
  driveToSearch(worker());
}

/** Emit a natural search completion: bestmove then the final info lines. */
function completeSearch(
  w: FakeInstance,
  heard: { bestmove: string; info: string },
): void {
  w.emit(heard.bestmove);
  w.emit(heard.info);
}

const COMPLETION = {
  bestmove: "bestmove e2e4",
  info: "info depth 12 seldepth 16 multipv 1 score cp 35 nodes 100 nps 1000 pv e2e4 e7e5",
};

test("one underlying worker for three leases of the same build", () => {
  setup();
  const engine = acquire("engine", "lite");
  const graph = acquire("graph", "lite");
  const review = acquire("review", "lite");
  activeSearch(engine, FEN_A);
  assert.equal(instances.length, 1);
  graph.analyze(FEN_B, 12, 1, 1);
  review.analyze(FEN_C, 12, 1, 1);
  releaseBarrier(worker());
  releaseBarrier(worker());
  assert.equal(instances.length, 1);
  engine.release();
  graph.release();
  review.release();
});

test("higher priority preempts: engine active, review analyze forwards", () => {
  setup();
  const engine = acquire("engine", "lite");
  const review = acquire("review", "lite");
  activeSearch(engine, FEN_A);
  const w = worker();
  w.sent.length = 0;
  review.analyze(FEN_B, 12, 1, 1);
  // Preemption goes through the client's stop+isready barrier (SIG-850).
  assert.deepEqual(w.sent, ["stop", "isready"]);
  releaseBarrier(w);
  assert.ok(w.sent.some((msg) => msg === `position fen ${FEN_B}`));
  assert.ok(w.sent.some((msg) => msg.startsWith("go depth")));
  engine.release();
  review.release();
});

test("lower priority does not preempt: review active, graph analyze queues", () => {
  setup();
  const graph = acquire("graph", "lite");
  const review = acquire("review", "lite");
  activeSearch(review, FEN_B);
  const w = worker();
  w.sent.length = 0;
  graph.analyze(FEN_A, 12, 1, 1);
  assert.deepEqual(w.sent, []);
  graph.release();
  review.release();
});

test("same-priority re-analyze forwards while active", () => {
  setup();
  const engine = acquire("engine", "lite");
  activeSearch(engine, FEN_A);
  const w = worker();
  w.sent.length = 0;
  engine.analyze(FEN_B, 12, 1, 1);
  assert.ok(w.sent.includes("stop"));
  assert.ok(w.sent.includes("isready"));
  engine.release();
});

test("release promotes highest waiter, not the lower one", () => {
  setup();
  const engine = acquire("engine", "lite");
  const graph = acquire("graph", "lite");
  const review = acquire("review", "lite");
  activeSearch(review, FEN_C);
  // Both wait while review holds the engine (engine outranks graph).
  engine.analyze(FEN_A, 12, 1, 1);
  graph.analyze(FEN_B, 12, 1, 1);
  const w = worker();
  w.sent.length = 0;
  review.release();
  releaseBarrier(w);
  assert.ok(w.sent.some((msg) => msg === `position fen ${FEN_A}`));
  assert.ok(!w.sent.some((msg) => msg === `position fen ${FEN_B}`));
  engine.release();
  graph.release();
});

test("subscribe isolation: inactive slot hears nothing until promoted", () => {
  setup();
  const engine = acquire("engine", "lite");
  const review = acquire("review", "lite");
  const heardByEngine: EngineInfo[] = [];
  const heardByReview: EngineInfo[] = [];
  const unsubEngine = engine.subscribe((info) => {
    heardByEngine.push(info);
  });
  const unsubReview = review.subscribe((info) => {
    heardByReview.push(info);
  });
  void unsubEngine;
  void unsubReview;
  // No active search yet: replay snapshots go to both.
  assert.ok(heardByEngine.length > 0);
  assert.ok(heardByReview.length > 0);
  heardByEngine.length = 0;
  heardByReview.length = 0;

  activeSearch(engine, FEN_A);
  worker().emit("info depth 10 seldepth 12 multipv 1 score cp 35 nodes 100 nps 1000 pv e2e4 e7e5");
  assert.ok(heardByEngine.length > 0);
  assert.deepEqual(heardByReview, []);

  // Review preempts; engine's listener goes silent, review hears its search.
  review.analyze(FEN_B, 12, 1, 1);
  releaseBarrier(worker());
  worker().emit("info depth 10 seldepth 12 multipv 1 score cp 15 nodes 100 nps 1000 pv e2e4 e7e5");
  assert.ok(heardByReview.length > 0);
  const engineCount = heardByEngine.length;
  worker().emit("info depth 11 seldepth 12 multipv 1 score cp 16 nodes 200 nps 1000 pv e2e4 e7e5");
  assert.equal(heardByEngine.length, engineCount);

  // Review releases: engine resumes and hears again.
  heardByEngine.length = 0;
  review.release();
  releaseBarrier(worker());
  worker().emit("info depth 10 seldepth 12 multipv 1 score cp 35 nodes 100 nps 1000 pv e2e4 e7e5");
  assert.ok(heardByEngine.length > 0);
  assert.equal(heardByEngine[heardByEngine.length - 1]?.fen, FEN_A);
  engine.release();
});

test("stop from non-active slot is silent; stop from active stops", () => {
  setup();
  const graph = acquire("graph", "lite");
  const review = acquire("review", "lite");
  activeSearch(review, FEN_B);
  graph.analyze(FEN_A, 12, 1, 1);
  const w = worker();
  const before = w.sent.length;
  graph.stop();
  assert.equal(w.sent.length, before);
  review.stop();
  assert.ok(w.sent.slice(before).includes("stop"));
  graph.release();
  review.release();
});

test("build switch disposes the stale worker and creates lazily", () => {
  setup();
  const engineLite = acquire("engine", "lite");
  activeSearch(engineLite, FEN_A);
  const liteWorker = worker();
  assert.equal(instances.length, 1);
  const graphStandard = acquire("graph", "standard");
  assert.equal(liteWorker.terminated, true);
  // Lazy: no new worker until the new build analyzes.
  assert.equal(instances.length, 1);
  graphStandard.analyze(FEN_B, 12, 1, 1);
  assert.equal(instances.length, 2);
  assert.notEqual(worker().url, liteWorker.url);
  // Stale-build leases are inert.
  engineLite.analyze(FEN_C, 12, 1, 1);
  assert.equal(instances.length, 2);
  engineLite.release();
  graphStandard.release();
});

test("analyze-before-subscribe replays running state (Review contract)", () => {
  setup();
  const review = acquire("review", "lite");
  review.analyze(FEN_A, 12, 1, 1);
  let seen: EngineInfo | null = null;
  const unsubscribe = review.subscribe((info) => {
    seen = info;
  });
  // subscribe() replays synchronously, after analyze() cleared lines and set
  // running — so the first snapshot must already show the active search.
  assert.ok(seen !== null);
  assert.equal((seen as EngineInfo | null)?.running, true);
  assert.equal((seen as EngineInfo | null)?.fen, FEN_A);
  unsubscribe();
  review.release();
});

test("queued waiter starts when the active search completes naturally", async () => {
  setup();
  const engine = acquire("engine", "lite");
  const graph = acquire("graph", "lite");
  activeSearch(engine, FEN_A);
  graph.analyze(FEN_B, 12, 1, 1);
  const w = worker();
  w.sent.length = 0;
  // The client's go-depth search finishes on its own: bestmove, then a final
  // info line with running false. The queued graph search must start without
  // any further stop/release from the owner. Promotion is deferred to a
  // microtask so the owner's own completion snapshot is delivered first.
  completeSearch(w, COMPLETION);
  await Promise.resolve();
  await Promise.resolve();
  releaseBarrier(w);
  assert.ok(w.sent.some((msg) => msg === `position fen ${FEN_B}`));
  assert.ok(w.sent.some((msg) => msg.startsWith("go depth")));
  engine.release();
  graph.release();
});

test("stop from the active slot promotes without clobbering (reentrancy)", () => {
  setup();
  const engine = acquire("engine", "lite");
  const graph = acquire("graph", "lite");
  activeSearch(engine, FEN_A);
  graph.analyze(FEN_B, 12, 1, 1);
  const w = worker();
  w.sent.length = 0;
  // stopSearch() clears activeSlot BEFORE emitting synchronously, so the
  // promotion to the waiter during the emit survives (no clobbering).
  engine.stop();
  assert.ok(w.sent.includes("stop"));
  releaseBarrier(w);
  assert.ok(w.sent.some((msg) => msg === `position fen ${FEN_B}`));
  engine.release();
  graph.release();
});

test("release from the active slot stops the orphaned search", () => {
  setup();
  const engine = acquire("engine", "lite");
  activeSearch(engine, FEN_A);
  const w = worker();
  w.sent.length = 0;
  engine.release();
  assert.ok(w.sent.includes("stop"));
});

test("slots typecheck as the EngineSlot union", () => {
  const slots: EngineSlot[] = ["engine", "graph", "review", "threat"];
  assert.deepEqual(slots.length, 4);
});

test("threat preempts engine and engine resumes on threat stop", () => {
  setup();
  const engine = acquire("engine", "lite");
  const threat = acquire("threat", "lite");
  activeSearch(engine, FEN_A);
  const w = worker();
  w.sent.length = 0;
  threat.analyze(FEN_B, 14, 1, 1);
  assert.deepEqual(w.sent, ["stop", "isready"]);
  releaseBarrier(w);
  assert.ok(w.sent.some((msg) => msg === `position fen ${FEN_B}`));
  w.sent.length = 0;
  threat.stop();
  assert.ok(w.sent.includes("stop"));
  releaseBarrier(w);
  assert.ok(w.sent.some((msg) => msg === `position fen ${FEN_A}`));
  engine.release();
  threat.release();
});

test("threat preempts review and review resumes on threat release", () => {
  setup();
  const review = acquire("review", "lite");
  const threat = acquire("threat", "lite");
  activeSearch(review, FEN_C);
  const w = worker();
  w.sent.length = 0;
  threat.analyze(FEN_B, 14, 1, 1);
  assert.deepEqual(w.sent, ["stop", "isready"]);
  releaseBarrier(w);
  assert.ok(w.sent.some((msg) => msg === `position fen ${FEN_B}`));
  w.sent.length = 0;
  threat.release();
  assert.ok(w.sent.includes("stop"));
  releaseBarrier(w);
  assert.ok(w.sent.some((msg) => msg === `position fen ${FEN_C}`));
  review.release();
});

test("threat subscribe isolation: engine hears nothing while threat is active", () => {
  setup();
  const engine = acquire("engine", "lite");
  const threat = acquire("threat", "lite");
  const heardByEngine: EngineInfo[] = [];
  const heardByThreat: EngineInfo[] = [];
  const unsubEngine = engine.subscribe((info) => {
    heardByEngine.push(info);
  });
  const unsubThreat = threat.subscribe((info) => {
    heardByThreat.push(info);
  });
  void unsubEngine;
  void unsubThreat;
  // No active search yet: replay snapshots go to both.
  assert.ok(heardByEngine.length > 0);
  assert.ok(heardByThreat.length > 0);
  heardByEngine.length = 0;
  heardByThreat.length = 0;
  activeSearch(engine, FEN_A);
  worker().emit("info depth 10 seldepth 12 multipv 1 score cp 35 nodes 100 nps 1000 pv e2e4 e7e5");
  assert.ok(heardByEngine.length > 0);
  assert.deepEqual(heardByThreat, []);

  // Threat preempts; engine's listener goes silent, threat hears its search.
  threat.analyze(FEN_B, 14, 1, 1);
  releaseBarrier(worker());
  worker().emit("info depth 10 seldepth 12 multipv 1 score cp 15 nodes 100 nps 1000 pv e2e4 e7e5");
  assert.ok(heardByThreat.length > 0);
  const engineCount = heardByEngine.length;
  worker().emit("info depth 11 seldepth 12 multipv 1 score cp 16 nodes 200 nps 1000 pv e2e4 e7e5");
  assert.equal(heardByEngine.length, engineCount);
  engine.release();
  threat.release();
});
