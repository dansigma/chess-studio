import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  ENGINE_RETRY_MS,
  MAX_DEPTH,
  MAX_LINES,
  MIN_DEPTH,
  MIN_LINES,
  StockfishEngine,
  clampDepth,
  clampLines,
  clampThreads,
  defaultEngineThreads,
  engineWorkerUrl,
  formatScore,
  isEngineBuild,
  maxHardwareThreads,
  positionAfterPv,
  pvSanComputations,
  resetPvSanComputationsForTests,
  scoreNumber,
  supportsEngineThreads,
  type EngineInfo,
  type EngineLine,
} from "./stockfish-client.ts";

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

function last(): FakeInstance {
  return instances[instances.length - 1];
}

function freshEngine(): { engine: StockfishEngine; worker: FakeInstance } {
  instances.length = 0;
  const engine = new StockfishEngine("lite");
  engine.start();
  return { engine, worker: last() };
}

function handshake(worker: FakeInstance): void {
  worker.emit("uciok");
  worker.emit("readyok");
}

function snap(engine: StockfishEngine): EngineInfo {
  let info!: EngineInfo;
  const unsub = engine.subscribe((snapshot) => {
    info = snapshot;
  });
  unsub();
  return info;
}

test("handshake: start sends uci, uciok sends isready, readyok marks ready", () => {
  const { engine, worker } = freshEngine();
  assert.deepEqual(worker.sent, ["uci"]);
  worker.emit("uciok");
  assert.ok(worker.sent.includes("isready"));
  assert.equal(snap(engine).ready, false);
  worker.emit("readyok");
  assert.equal(snap(engine).ready, true);
  engine.dispose();
});

test("queue: analyze sends stop+isready, readyok sends options+position+go", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  worker.sent.length = 0;
  engine.analyze(FEN_A, 22, 2, 1);
  assert.deepEqual(worker.sent, ["stop", "isready"]);
  assert.equal(snap(engine).running, true);
  worker.emit("readyok");
  assert.deepEqual(worker.sent, [
    "stop",
    "isready",
    "setoption name Hash value 16",
    "setoption name Threads value 1",
    "setoption name MultiPV value 2",
    "ucinewgame",
    `position fen ${FEN_A}`,
    "go depth 22",
  ]);
  // searching is observable: info lines are accepted only once the search started
  worker.emit("info depth 10 seldepth 12 multipv 1 score cp 35 nodes 100 nps 1000 pv e2e4 e7e5");
  assert.equal(snap(engine).lines.length, 1);
  engine.dispose();
});

test("regression: in-flight bestmove before readyok does not stop the new search", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  worker.sent.length = 0;
  engine.analyze(FEN_A, 22, 2, 1);
  // old search's bestmove arrives while the new search is still queued
  worker.emit("bestmove e2e4");
  assert.equal(snap(engine).running, true);
  worker.emit("readyok");
  assert.equal(snap(engine).running, true);
  assert.ok(worker.sent.some((msg) => msg.startsWith("go depth")));
  engine.dispose();
});

test("barrier: readyok waits for the interrupted search's bestmove (real-engine order)", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  // Search A is actively running.
  engine.analyze(FEN_A, 22, 2, 1);
  worker.emit("readyok");
  worker.emit("info depth 20 seldepth 28 multipv 1 score cp 35 nodes 1000 nps 50000 pv e2e4 e7e5");
  assert.equal(snap(engine).lines.length, 1);
  worker.sent.length = 0;
  // Interrupt with B while A is still searching.
  engine.analyze(FEN_B, 22, 2, 1);
  assert.deepEqual(worker.sent, ["stop", "isready"]);
  // The real engine answers readyok BEFORE the interrupted search's bestmove.
  worker.emit("readyok");
  // The batch for B must NOT be sent yet.
  assert.ok(!worker.sent.some((msg) => msg.startsWith("position fen")));
  assert.ok(!worker.sent.some((msg) => msg.startsWith("go depth")));
  assert.equal(snap(engine).running, true);
  // The interrupted search's bestmove releases the barrier.
  worker.emit("bestmove e2e4");
  assert.ok(worker.sent.some((msg) => msg === `position fen ${FEN_B}`));
  assert.ok(worker.sent.some((msg) => msg.startsWith("go depth 22")));
  assert.equal(snap(engine).running, true);
  // Only B's data enters the lines.
  worker.emit("info depth 10 seldepth 12 multipv 1 score cp 15 nodes 100 nps 1000 pv e2e4 e7e5");
  assert.equal(snap(engine).lines.length, 1);
  assert.equal(snap(engine).lines[0]?.scoreCp, 15);
  assert.equal(snap(engine).depth, 10);
  engine.dispose();
});

test("barrier: stale info while the barrier waits is rejected", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  engine.analyze(FEN_A, 22, 2, 1);
  worker.emit("readyok");
  worker.sent.length = 0;
  engine.analyze(FEN_B, 22, 2, 1);
  worker.emit("readyok");
  // Stale info from the interrupted search (old depth/score) must not enter.
  worker.emit("info depth 21 seldepth 28 multipv 1 score cp 90 nodes 2000 nps 50000 pv e2e4 e7e5");
  assert.equal(snap(engine).lines.length, 0);
  assert.equal(snap(engine).depth, 0);
  worker.emit("bestmove e2e4");
  worker.emit("info depth 10 seldepth 12 multipv 1 score cp 15 nodes 100 nps 1000 pv e2e4 e7e5");
  assert.equal(snap(engine).lines.length, 1);
  assert.equal(snap(engine).lines[0]?.scoreCp, 15);
  engine.dispose();
});

test("barrier: idle analyze starts on readyok without waiting", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  worker.sent.length = 0;
  // No search is active, so nothing owes a bestmove.
  engine.analyze(FEN_B, 22, 2, 1);
  worker.emit("readyok");
  assert.ok(worker.sent.some((msg) => msg === `position fen ${FEN_B}`));
  assert.ok(worker.sent.some((msg) => msg.startsWith("go depth 22")));
  assert.equal(snap(engine).running, true);
  engine.dispose();
});

test("barrier: analyze twice while waiting starts the latest request only", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  engine.analyze(FEN_A, 22, 2, 1);
  worker.emit("readyok");
  worker.sent.length = 0;
  engine.analyze(FEN_B, 22, 2, 1);
  // A second analyze replaces the pending request; the flags persist.
  engine.analyze(FEN_A, 22, 2, 1);
  assert.deepEqual(worker.sent, ["stop", "isready"]);
  worker.emit("readyok");
  assert.ok(!worker.sent.some((msg) => msg.startsWith("go depth")));
  worker.emit("bestmove e2e4");
  const positions = worker.sent.filter((msg) => msg.startsWith("position fen"));
  assert.equal(positions.length, 1);
  assert.equal(positions[0], `position fen ${FEN_A}`);
  assert.equal(snap(engine).running, true);
  engine.dispose();
});

test("analyze twice before readyok starts the latest request only", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  worker.sent.length = 0;
  engine.analyze(FEN_A, 22, 2, 1);
  engine.analyze(FEN_B, 22, 2, 1);
  // second analyze replaces pending; no extra stop/isready pair
  assert.deepEqual(worker.sent, ["stop", "isready"]);
  worker.emit("readyok");
  const positions = worker.sent.filter((msg) => msg.startsWith("position fen"));
  assert.equal(positions.length, 1);
  assert.equal(positions[0], `position fen ${FEN_B}`);
  engine.dispose();
});

test("barrier: a search started after stopSearch waits for the stopped search's bestmove", () => {
  // Cancel in Game Review: the review search is stopped, then another search is
  // requested at once. The engine answers readyok before the stopped search's
  // bestmove; sending ucinewgame/position/go then aborts the worker.
  const { engine, worker } = freshEngine();
  handshake(worker);
  engine.analyze(FEN_A, 22, 2, 1);
  worker.emit("readyok");
  assert.ok(worker.sent.some((msg) => msg.startsWith("go depth")));
  engine.stopSearch();
  worker.sent.length = 0;
  engine.analyze(FEN_B, 22, 2, 1, undefined, true);
  assert.deepEqual(worker.sent, ["stop", "isready"]);
  worker.emit("readyok");
  assert.ok(!worker.sent.includes("ucinewgame"));
  assert.ok(!worker.sent.some((msg) => msg.startsWith("position fen")));
  assert.ok(!worker.sent.some((msg) => msg.startsWith("go depth")));
  worker.emit("bestmove e2e4");
  assert.ok(worker.sent.includes("ucinewgame"));
  assert.ok(worker.sent.includes(`position fen ${FEN_B}`));
  assert.ok(worker.sent.some((msg) => msg.startsWith("go depth 22")));
  engine.dispose();
});

test("barrier: the bestmove of a stopped search is ignored and nothing is owed afterwards", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  engine.analyze(FEN_A, 22, 2, 1);
  worker.emit("readyok");
  engine.stopSearch();
  worker.emit("bestmove e2e4");
  assert.equal(snap(engine).running, false);
  worker.sent.length = 0;
  engine.analyze(FEN_B, 22, 2, 1);
  worker.emit("readyok");
  assert.ok(worker.sent.some((msg) => msg.startsWith("go depth 22")));
  engine.dispose();
});

test("barrier: two stopped searches in a row both have to report before the next one starts", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  engine.analyze(FEN_A, 22, 2, 1);
  worker.emit("readyok");
  engine.stopSearch();
  // A second search is requested and started once the first stop settled.
  engine.analyze(FEN_B, 22, 2, 1);
  worker.emit("bestmove e2e4");
  worker.emit("readyok");
  assert.ok(worker.sent.some((msg) => msg.startsWith("go depth 22")));
  engine.stopSearch();
  worker.sent.length = 0;
  engine.analyze(FEN_A, 22, 2, 1);
  worker.emit("readyok");
  assert.ok(!worker.sent.some((msg) => msg.startsWith("go depth")));
  worker.emit("bestmove e7e5");
  assert.ok(worker.sent.some((msg) => msg.startsWith("go depth 22")));
  engine.dispose();
});

test("stopSearch sends stop, clears running and pending", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  worker.sent.length = 0;
  engine.analyze(FEN_A, 22, 2, 1);
  engine.stopSearch();
  assert.ok(worker.sent.includes("stop"));
  assert.equal(snap(engine).running, false);
  const sentBefore = worker.sent.length;
  worker.emit("readyok");
  assert.equal(worker.sent.length, sentBefore);
  engine.dispose();
});

test("first worker error does not fail the client", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  // SIG-1081: the first error schedules one automatic retry; the second
  // consecutive error marks the client failed.
  worker.fail();
  assert.equal(snap(engine).failed, false);
  engine.dispose();
});

test("SIG-1081: first worker error triggers one automatic retry that recovers", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { engine, worker } = freshEngine();
    handshake(worker);
    engine.analyze(FEN_A, 22, 2, 1);
    worker.emit("readyok");
    const countBefore = instances.length;
    const urlBefore = worker.url;
    worker.fail();
    // First error is not yet failed; the dead worker is terminated.
    assert.equal(snap(engine).failed, false);
    assert.equal(worker.terminated, true);
    // Fire the retry timer: exactly one new worker with the same build.
    mock.timers.tick(ENGINE_RETRY_MS);
    assert.equal(instances.length, countBefore + 1);
    const retry = last();
    assert.equal(retry.url, urlBefore);
    assert.deepEqual(retry.sent.slice(0, 1), ["uci"]);
    // The new worker's handshake re-issues the pending search.
    retry.emit("uciok");
    assert.equal(snap(engine).failed, false);
    retry.emit("readyok");
    retry.emit("readyok");
    assert.ok(retry.sent.some((msg) => msg === `position fen ${FEN_A}`));
    assert.ok(retry.sent.some((msg) => msg.startsWith("go depth")));
    retry.emit("info depth 10 seldepth 12 multipv 1 score cp 35 nodes 100 nps 1000 pv e2e4 e7e5");
    assert.equal(snap(engine).failed, false);
    assert.equal(snap(engine).lines.length, 1);
    engine.dispose();
  } finally {
    mock.timers.reset();
  }
});

test("SIG-1081: two consecutive errors set failed and stop retrying", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { engine, worker } = freshEngine();
    handshake(worker);
    engine.analyze(FEN_A, 22, 2, 1);
    worker.emit("readyok");
    worker.fail();
    mock.timers.tick(ENGINE_RETRY_MS);
    const retry = last();
    assert.equal(snap(engine).failed, false);
    retry.fail();
    assert.equal(snap(engine).failed, true);
    const countAfterSecond = instances.length;
    mock.timers.tick(ENGINE_RETRY_MS * 2);
    assert.equal(instances.length, countAfterSecond);
    assert.equal(snap(engine).failed, true);
    engine.dispose();
  } finally {
    mock.timers.reset();
  }
});

test("SIG-1081: restart() after failure recovers and analyzes again", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { engine, worker } = freshEngine();
    handshake(worker);
    engine.analyze(FEN_A, 22, 2, 1);
    worker.emit("readyok");
    worker.fail();
    mock.timers.tick(ENGINE_RETRY_MS);
    last().fail();
    assert.equal(snap(engine).failed, true);
    const countBefore = instances.length;
    engine.restart();
    assert.equal(snap(engine).failed, false);
    assert.equal(instances.length, countBefore + 1);
    const fresh = last();
    handshake(fresh);
    engine.analyze(FEN_A, 22, 2, 1);
    fresh.emit("readyok");
    assert.ok(fresh.sent.some((msg) => msg === `position fen ${FEN_A}`));
    fresh.emit("info depth 10 seldepth 12 multipv 1 score cp 35 nodes 100 nps 1000 pv e2e4 e7e5");
    assert.equal(snap(engine).failed, false);
    assert.equal(snap(engine).lines.length, 1);
    engine.dispose();
  } finally {
    mock.timers.reset();
  }
});

test("SIG-1081: dispose() during the retry window leaves no timer or worker behind", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { engine, worker } = freshEngine();
    handshake(worker);
    engine.analyze(FEN_A, 22, 2, 1);
    worker.emit("readyok");
    worker.fail();
    assert.equal(snap(engine).failed, false);
    const countBefore = instances.length;
    engine.dispose();
    mock.timers.tick(ENGINE_RETRY_MS * 2);
    assert.equal(instances.length, countBefore);
  } finally {
    mock.timers.reset();
  }
});

test("dispose terminates the worker and clears listeners", () => {
  const { engine, worker } = freshEngine();
  let calls = 0;
  const unsub = engine.subscribe(() => {
    calls += 1;
  });
  const callsAfterSubscribe = calls;
  assert.ok(callsAfterSubscribe >= 1);
  engine.dispose();
  unsub();
  assert.equal(worker.terminated, true);
  // a second subscriber sees no further notifications after dispose
  let lateCalls = 0;
  const unsub2 = engine.subscribe(() => {
    lateCalls += 1;
  });
  unsub2();
  assert.equal(lateCalls, 1);
  worker.emit("readyok");
  assert.equal(lateCalls, 1);
  assert.equal(calls, callsAfterSubscribe);
});

test("scoreNumber and formatScore keep mate distance", () => {
  const m1: EngineLine = { multipv: 1, depth: 10, scoreCp: null, mate: 1, pvUci: ["e2e4"], pvSan: ["e4"], bound: null };
  const m5: EngineLine = { multipv: 1, depth: 10, scoreCp: null, mate: 5, pvUci: ["e2e4"], pvSan: ["e4"], bound: null };
  assert.equal(scoreNumber(m1, "w"), 9990);
  assert.equal(scoreNumber(m5, "w"), 9950);
  assert.equal(formatScore(m1, "w"), "M1");
  assert.equal(formatScore({ ...m1, mate: -3 }, "w"), "-M3");
  // black to move flips the sign
  assert.equal(scoreNumber(m1, "b"), -9990);
  assert.equal(formatScore(m1, "b"), "-M1");
});

test("bounded line does not replace the exact line for the same multipv", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  engine.analyze(FEN_A, 22, 2, 1);
  worker.emit("readyok");
  worker.emit("info depth 20 seldepth 28 multipv 1 score cp 35 nodes 1000 nps 50000 pv e2e4 e7e5");
  assert.equal(snap(engine).lines[0]?.scoreCp, 35);
  worker.emit("info depth 21 seldepth 28 multipv 1 score cp 80 nodes 2000 nps 50000 pv e2e4 e7e5 upperbound");
  assert.equal(snap(engine).lines[0]?.scoreCp, 35);
  engine.dispose();
});

test("bounded line is accepted when there is no exact line yet", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  engine.analyze(FEN_A, 22, 2, 1);
  worker.emit("readyok");
  worker.emit("info depth 21 seldepth 28 multipv 1 score cp 80 nodes 2000 nps 50000 pv e2e4 e7e5 lowerbound");
  assert.equal(snap(engine).lines.length, 1);
  assert.equal(snap(engine).lines[0]?.bound, "lower");
  engine.dispose();
});

test("supportsEngineThreads is false in Node without cross-origin isolation", () => {
  assert.equal(supportsEngineThreads(), false);
});

test("clampDepth clamps to 8–40 and rounds", () => {
  assert.equal(clampDepth(MIN_DEPTH - 10), MIN_DEPTH);
  assert.equal(clampDepth(MAX_DEPTH + 10), MAX_DEPTH);
  assert.equal(clampDepth(22), 22);
  assert.equal(clampDepth(22.6), 23);
  assert.equal(clampDepth(22.4), 22);
});

test("clampLines clamps to 1–5 and rounds", () => {
  assert.equal(clampLines(MIN_LINES - 5), MIN_LINES);
  assert.equal(clampLines(MAX_LINES + 5), MAX_LINES);
  assert.equal(clampLines(2), 2);
  assert.equal(clampLines(2.6), 3);
});

test("clampThreads floors at 1 and caps without thread support", () => {
  assert.equal(supportsEngineThreads(), false);
  assert.equal(clampThreads(0), 1);
  assert.equal(clampThreads(-5), 1);
  assert.equal(clampThreads(1), 1);
  assert.equal(clampThreads(8), 1);
});

test("positionAfterPv applies UCI moves and strips the promotion suffix", () => {
  const two = positionAfterPv(FEN_A, ["e2e4", "e7e5"]);
  assert.ok(two);
  assert.equal(two.lastMove, "e7e5");
  assert.match(two.fen, / w KQkq /);

  const one = positionAfterPv(FEN_A, ["e2e4"]);
  assert.ok(one);
  assert.equal(one.lastMove, "e2e4");
  assert.match(one.fen, / b KQkq /);

  const promo = positionAfterPv("8/4P3/8/8/8/8/8/4K2k w - - 0 1", ["e7e8q"]);
  assert.ok(promo);
  assert.equal(promo.lastMove, "e7e8");
  assert.match(promo.fen, /Q/);
});

test("positionAfterPv returns null for empty or illegal PV", () => {
  assert.equal(positionAfterPv(FEN_A, []), null);
  assert.equal(positionAfterPv(FEN_A, ["e2e4", "e2e4"]), null);
  assert.equal(positionAfterPv(FEN_A, ["zzzz"]), null);
});

test("engineWorkerUrl and isEngineBuild resolve per build", () => {
  assert.equal(supportsEngineThreads(), false);
  assert.equal(engineWorkerUrl("lite"), "/engine/stockfish.js");
  assert.equal(engineWorkerUrl("standard"), "/engine/stockfish-19-single.js");
  assert.equal(isEngineBuild("lite"), true);
  assert.equal(isEngineBuild("standard"), true);
  assert.equal(isEngineBuild("full"), false);
  assert.equal(isEngineBuild(""), false);
  assert.equal(isEngineBuild(null), false);
  assert.equal(isEngineBuild(undefined), false);
  assert.equal(isEngineBuild(123), false);
});

test("defaultEngineThreads and maxHardwareThreads stay sane", () => {
  const max = maxHardwareThreads();
  const fallback = defaultEngineThreads();
  for (const value of [max, fallback]) {
    assert.ok(Number.isInteger(value));
    assert.ok(value >= 1);
  }
  assert.ok(fallback <= max);
  // No SharedArrayBuffer cross-origin isolation in Node, so the default is single-threaded.
  assert.equal(fallback, 1);
});

test("SIG-1080: pvSan is computed at most once per distinct (fen, pv) across 100 identical info lines", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  engine.analyze(FEN_A, 22, 2, 1);
  worker.emit("readyok");
  resetPvSanComputationsForTests();
  const line = "info depth 10 seldepth 12 multipv 1 score cp 35 nodes 100 nps 1000 pv e2e4 e7e5";
  for (let i = 0; i < 100; i += 1) {
    worker.emit(line);
  }
  assert.deepEqual(snap(engine).lines[0]?.pvSan, ["e4", "e5"]);
  assert.ok(pvSanComputations <= 1, `expected at most 1 SAN computation, got ${pvSanComputations}`);
  engine.dispose();
});

test("SIG-1080: the final snapshot of a scripted search equals the previous output", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  engine.analyze(FEN_A, 22, 2, 1);
  worker.emit("readyok");
  worker.emit("info depth 10 seldepth 12 multipv 1 score cp 35 nodes 100 nps 1000 pv e2e4 e7e5");
  worker.emit("info depth 10 seldepth 12 multipv 2 score cp 20 nodes 100 nps 1000 pv d2d4 d7d5");
  worker.emit("info depth 12 seldepth 16 multipv 1 score cp 40 nodes 500 nps 2000 pv e2e4 e7e5 g1f3");
  worker.emit("info depth 12 seldepth 16 multipv 2 score cp 22 nodes 500 nps 2000 pv d2d4 d7d5 c1f4");
  worker.emit("bestmove e2e4");
  const final = snap(engine);
  assert.equal(final.running, false);
  assert.equal(final.depth, 12);
  assert.deepEqual(
    final.lines.map((line) => ({ multipv: line.multipv, scoreCp: line.scoreCp, pvSan: line.pvSan })),
    [
      { multipv: 1, scoreCp: 40, pvSan: ["e4", "e5", "Nf3"] },
      { multipv: 2, scoreCp: 22, pvSan: ["d4", "d5", "Bf4"] },
    ],
  );
  engine.dispose();
});
