import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createLongPress, swipeDirection } from "./use-gestures.ts";

test("swipe: 41 px left is forward, 39 px is not a swipe", () => {
  assert.equal(swipeDirection({ x: 200, y: 400 }, { x: 159, y: 400 }), "left");
  assert.equal(swipeDirection({ x: 200, y: 400 }, { x: 161, y: 400 }), null);
});

test("swipe: 41 px right is back, 39 px is not a swipe", () => {
  assert.equal(swipeDirection({ x: 200, y: 400 }, { x: 241, y: 400 }), "right");
  assert.equal(swipeDirection({ x: 200, y: 400 }, { x: 239, y: 400 }), null);
});

test("swipe: vertical drift above maxVertical is ignored", () => {
  assert.equal(swipeDirection({ x: 200, y: 400 }, { x: 140, y: 431 }), null);
  assert.equal(swipeDirection({ x: 200, y: 400 }, { x: 140, y: 429 }), "left");
});

test("swipe: custom thresholds apply", () => {
  assert.equal(
    swipeDirection({ x: 200, y: 400 }, { x: 180, y: 400 }, { minDistance: 20 }),
    "left",
  );
  assert.equal(
    swipeDirection({ x: 200, y: 400 }, { x: 140, y: 450 }, { maxVertical: 100 }),
    "left",
  );
});

test("long press: fires once after the delay", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const press = createLongPress({ delayMs: 500, moveTolerance: 10 });
    let calls = 0;
    press.start({ x: 100, y: 100 }, () => {
      calls += 1;
    });
    mock.timers.tick(499);
    assert.equal(calls, 0);
    mock.timers.tick(1);
    assert.equal(calls, 1);
    mock.timers.tick(1000);
    assert.equal(calls, 1);
  } finally {
    mock.timers.reset();
  }
});

test("long press: movement beyond tolerance cancels the fire", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const press = createLongPress({ delayMs: 500, moveTolerance: 10 });
    let calls = 0;
    press.start({ x: 100, y: 100 }, () => {
      calls += 1;
    });
    press.move({ x: 111, y: 100 });
    mock.timers.tick(1000);
    assert.equal(calls, 0);
  } finally {
    mock.timers.reset();
  }
});

test("long press: small jitter within tolerance still fires", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const press = createLongPress({ delayMs: 500, moveTolerance: 10 });
    let calls = 0;
    press.start({ x: 100, y: 100 }, () => {
      calls += 1;
    });
    press.move({ x: 105, y: 103 });
    mock.timers.tick(500);
    assert.equal(calls, 1);
  } finally {
    mock.timers.reset();
  }
});

test("long press: end() before the delay suppresses the fire", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const press = createLongPress({ delayMs: 500, moveTolerance: 10 });
    let calls = 0;
    press.start({ x: 100, y: 100 }, () => {
      calls += 1;
    });
    mock.timers.tick(200);
    press.end();
    mock.timers.tick(1000);
    assert.equal(calls, 0);
  } finally {
    mock.timers.reset();
  }
});

test("long press: cancel() before the delay suppresses the fire", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const press = createLongPress({ delayMs: 500, moveTolerance: 10 });
    let calls = 0;
    press.start({ x: 100, y: 100 }, () => {
      calls += 1;
    });
    press.cancel();
    mock.timers.tick(1000);
    assert.equal(calls, 0);
  } finally {
    mock.timers.reset();
  }
});
