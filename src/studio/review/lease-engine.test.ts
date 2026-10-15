import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInfo, EngineLine } from "@/src/engine/stockfish-client";
import { createLeaseEngine } from "./lease-engine.ts";

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function line(multipv: number, scoreCp: number, uci: string): EngineLine {
  return { multipv, depth: 12, scoreCp, mate: null, pvUci: [uci], pvSan: [], bound: null };
}

function info(partial: Partial<EngineInfo>): EngineInfo {
  return { depth: 0, running: true, ready: true, failed: false, lines: [], nps: 0, nodes: 0, threaded: false, fen: FEN, ...partial };
}

type Listener = (value: EngineInfo) => void;

function fakeLease() {
  let listener: Listener | null = null;
  const calls: unknown[][] = [];
  return {
    lease: {
      analyze: (...args: unknown[]) => {
        calls.push(args);
      },
      subscribe: (next: Listener) => {
        listener = next;
        return () => {
          listener = null;
        };
      },
    },
    calls,
    emit: (value: EngineInfo) => listener?.(value),
    hasListener: () => listener !== null,
  };
}

test("resolves with all lines, white-relative, once the target depth is reached", async () => {
  const fake = fakeLease();
  const engine = createLeaseEngine(fake.lease as never, 2, () => false);
  const pending = engine.analyze(FEN, { depth: 12, lines: 3, timeoutMs: 1000, fresh: true });
  assert.deepEqual(fake.calls[0], [FEN, 12, 3, 2, undefined, true]);
  fake.emit(info({ depth: 8, lines: [line(1, 20, "e2e4")] }));
  fake.emit(info({ depth: 12, lines: [line(1, 30, "e2e4"), line(2, 10, "d2d4"), line(3, 0, "c2c4")] }));
  const result = await pending;
  assert.equal(result?.lines.length, 3);
  assert.equal(result?.lines[0].whitePawns, 0.3);
  assert.equal(result?.lines[1].uci, "d2d4");
  assert.equal(fake.hasListener(), false);
});

test("a search preempted by the threat slot resumes and still resolves", async () => {
  const fake = fakeLease();
  const engine = createLeaseEngine(fake.lease as never, 1, () => false);
  const pending = engine.analyze(FEN, { depth: 12, lines: 3, timeoutMs: 1000, fresh: false });
  fake.emit(info({ depth: 6, lines: [line(1, 20, "e2e4")] }));
  // Preempted: the lease delivers nothing for a while, then the search resumes.
  await new Promise((resolve) => setTimeout(resolve, 15));
  fake.emit(info({ depth: 12, running: false, lines: [line(1, 25, "e2e4"), line(2, 10, "d2d4"), line(3, 0, "c2c4")] }));
  const result = await pending;
  assert.equal(result?.depth, 12);
  assert.equal(result?.lines[0].whitePawns, 0.25);
});

test("a search cut short by another slot is re-issued instead of graded", async () => {
  const fake = fakeLease();
  const engine = createLeaseEngine(fake.lease as never, 1, () => false);
  const pending = engine.analyze(FEN, { depth: 16, lines: 3, timeoutMs: 1000, fresh: false, legalMoves: 20 });
  // Show threat stops the shared worker: shallow, one stale line, not running.
  fake.emit(info({ depth: 13, running: false, lines: [line(1, 80, "e2e4")] }));
  assert.equal(fake.calls.length, 2);
  fake.emit(info({ depth: 16, running: false, lines: [line(1, 30, "e2e4"), line(2, 10, "d2d4"), line(3, 0, "c2c4")] }));
  const result = await pending;
  assert.equal(result?.depth, 16);
  assert.equal(result?.lines.length, 3);
});

test("a shallow end is accepted for a forced move or a found mate", async () => {
  const forced = fakeLease();
  const forcedPending = createLeaseEngine(forced.lease as never, 1, () => false).analyze(FEN, {
    depth: 16,
    lines: 3,
    timeoutMs: 1000,
    fresh: false,
    legalMoves: 1,
  });
  forced.emit(info({ depth: 1, running: false, lines: [line(1, 0, "e2e4")] }));
  assert.equal((await forcedPending)?.depth, 1);
  assert.equal(forced.calls.length, 1);

  const mate = fakeLease();
  const matePending = createLeaseEngine(mate.lease as never, 1, () => false).analyze(FEN, {
    depth: 16,
    lines: 3,
    timeoutMs: 1000,
    fresh: false,
    legalMoves: 20,
  });
  mate.emit(info({ depth: 7, running: false, lines: [{ ...line(1, 0, "e2e4"), scoreCp: null, mate: 3 }, line(2, -50, "d2d4"), line(3, -60, "c2c4")] }));
  assert.equal((await matePending)?.depth, 7);
  assert.equal(mate.calls.length, 1);
});

test("after the restarts are used up the shallow result is accepted", async () => {
  const fake = fakeLease();
  const engine = createLeaseEngine(fake.lease as never, 1, () => false);
  const pending = engine.analyze(FEN, { depth: 16, lines: 3, timeoutMs: 1000, fresh: false, legalMoves: 20 });
  for (let i = 0; i < 3; i += 1) {
    fake.emit(info({ depth: 11, running: false, lines: [line(1, 20, "e2e4"), line(2, 10, "d2d4"), line(3, 0, "c2c4")] }));
  }
  assert.equal((await pending)?.depth, 11);
  assert.equal(fake.calls.length, 3);
});

test("a timeout resolves with the latest partial result", async () => {
  const fake = fakeLease();
  const engine = createLeaseEngine(fake.lease as never, 1, () => false);
  const pending = engine.analyze(FEN, { depth: 12, lines: 3, timeoutMs: 10, fresh: false });
  fake.emit(info({ depth: 7, lines: [line(1, 40, "e2e4")] }));
  const result = await pending;
  assert.equal(result?.depth, 7);
  assert.equal(fake.hasListener(), false);
});

test("snapshots of another position are ignored and a cancel resolves null", async () => {
  const fake = fakeLease();
  let cancelled = false;
  const engine = createLeaseEngine(fake.lease as never, 1, () => cancelled);
  const pending = engine.analyze(FEN, { depth: 12, lines: 3, timeoutMs: 1000, fresh: false });
  fake.emit(info({ depth: 12, fen: "8/8/8/8/8/8/8/K6k w - - 0 1", lines: [line(1, 99, "a1a2")] }));
  cancelled = true;
  fake.emit(info({ depth: 3, lines: [line(1, 5, "e2e4")] }));
  assert.equal(await pending, null);
});
