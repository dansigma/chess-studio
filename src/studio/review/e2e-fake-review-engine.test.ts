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
    lines: 3,
    timeoutMs: 1000,
    fresh: true,
  });
  const second = await engine.analyze("fen-a", {
    depth,
    lines: 3,
    timeoutMs: 1000,
    fresh: true,
  });
  assert.ok(first);
  assert.equal(first.depth, depth);
  assert.equal(first.lines.length, 3);
  // Same FEN always scores the same (resume runs and rechecks stay consistent).
  assert.deepEqual(second, first);
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
