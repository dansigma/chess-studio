import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { throttleLatest } from "./throttle.ts";

test("burst: 200 snapshots within one second cause at most 8 wrapped calls", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let calls = 0;
    let lastValue = -1;
    const wrapped = throttleLatest((value: number) => {
      calls += 1;
      lastValue = value;
    }, 150);
    for (let i = 0; i < 200; i += 1) {
      wrapped(i);
      mock.timers.tick(5);
    }
    mock.timers.tick(1000);
    assert.ok(calls <= 8, `expected at most 8 calls, got ${calls}`);
    assert.equal(lastValue, 199);
  } finally {
    mock.timers.reset();
  }
});

test("trailing: the last snapshot is delivered after the window elapses", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const seen: number[] = [];
    const wrapped = throttleLatest((value: number) => {
      seen.push(value);
    }, 150);
    wrapped(1);
    assert.deepEqual(seen, [1]);
    wrapped(2);
    wrapped(3);
    assert.deepEqual(seen, [1]);
    mock.timers.tick(150);
    assert.deepEqual(seen, [1, 3]);
  } finally {
    mock.timers.reset();
  }
});

test("flush delivers the pending snapshot; cancel drops it", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const flushed: number[] = [];
    const w1 = throttleLatest((value: number) => {
      flushed.push(value);
    }, 150);
    w1(1);
    w1(2);
    w1.flush();
    assert.deepEqual(flushed, [1, 2]);
    mock.timers.tick(1000);
    assert.deepEqual(flushed, [1, 2]);

    const cancelled: number[] = [];
    const w2 = throttleLatest((value: number) => {
      cancelled.push(value);
    }, 150);
    w2(1);
    w2(2);
    w2.cancel();
    mock.timers.tick(1000);
    assert.deepEqual(cancelled, [1]);
  } finally {
    mock.timers.reset();
  }
});
