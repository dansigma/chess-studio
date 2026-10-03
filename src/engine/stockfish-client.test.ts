import assert from "node:assert/strict";
import test from "node:test";
import {
  StockfishEngine,
  formatScore,
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

test("worker error surfaces failed in the snapshot", () => {
  const { engine, worker } = freshEngine();
  handshake(worker);
  worker.fail();
  assert.equal(snap(engine).failed, true);
  engine.dispose();
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
