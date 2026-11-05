import assert from "node:assert/strict";
import test from "node:test";
import {
  createE2eFakeReviewEngine,
  isE2eFakeReviewEnabled,
} from "./e2e-fake-review-engine.ts";
import { REVIEW_PRESETS } from "../../chess/review-engine.ts";

const FLAG = "NEXT_PUBLIC_E2E_REVIEW_FAKE";

function withFlag(value: string | undefined, fn: () => void): void {
  const previous = process.env[FLAG];
  try {
    if (value === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = value;
    }
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = previous;
    }
  }
}

test("the fake is disabled unless the flag is exactly \"1\" (fails closed)", () => {
  withFlag(undefined, () => assert.equal(isE2eFakeReviewEnabled(), false));
  withFlag("", () => assert.equal(isE2eFakeReviewEnabled(), false));
  withFlag("true", () => assert.equal(isE2eFakeReviewEnabled(), false));
  withFlag("1", () => assert.equal(isE2eFakeReviewEnabled(), true));
});

test("the fake scores every position deterministically at the requested depth", async () => {
  const engine = createE2eFakeReviewEngine({ delayMs: 0 });
  const depth = REVIEW_PRESETS.fast.depth;
  const first = await engine.analyze("fen-a", {
    depth,
    lines: 2,
    timeoutMs: 1000,
    fresh: true,
  });
  const second = await engine.analyze("fen-a", {
    depth,
    lines: 2,
    timeoutMs: 1000,
    fresh: true,
  });
  assert.ok(first);
  assert.equal(first.depth, depth);
  assert.equal(first.lines.length, 2);
  // Same FEN always scores the same (resume runs and rechecks stay consistent).
  assert.deepEqual(second, first);
});

test("SIG-1224: the best line does not depend on how many lines were asked for, so e2e labels are unchanged", async () => {
  const engine = createE2eFakeReviewEngine({ delayMs: 0 });
  const fens = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
  ];
  for (const fen of fens) {
    const one = await engine.analyze(fen, { depth: 12, lines: 1, timeoutMs: 1000, fresh: true });
    const two = await engine.analyze(fen, { depth: 12, lines: 2, timeoutMs: 1000, fresh: false });
    assert.deepEqual(one?.lines[0], two?.lines[0]);
  }
});

test("the fake returns null once cancelled", async () => {
  let cancelled = false;
  const engine = createE2eFakeReviewEngine({
    delayMs: 0,
    isCancelled: () => cancelled,
  });
  const before = await engine.analyze("fen-a", {
    depth: 10,
    lines: 1,
    timeoutMs: 1000,
    fresh: true,
  });
  assert.ok(before);
  cancelled = true;
  assert.equal(
    await engine.analyze("fen-b", {
      depth: 10,
      lines: 1,
      timeoutMs: 1000,
      fresh: true,
    }),
    null,
  );
});
