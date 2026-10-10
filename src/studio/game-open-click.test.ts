import assert from "node:assert/strict";
import test from "node:test";
import { createSingleDoubleClick, type GameOpenClickTimer } from "./game-open-click.ts";

function manualTimer() {
  let callback: (() => void) | null = null;
  let cleared = 0;
  const timer: GameOpenClickTimer = {
    set: (next) => {
      callback = next;
      return callback;
    },
    clear: () => {
      cleared += 1;
      callback = null;
    },
  };
  return {
    timer,
    cleared: () => cleared,
    fire: () => {
      const next = callback;
      callback = null;
      next?.();
    },
    hasPending: () => callback !== null,
  };
}

test("single click fires onSingle after the delay", () => {
  const calls: string[] = [];
  const clock = manualTimer();
  const click = createSingleDoubleClick({
    onSingle: () => calls.push("single"),
    onDouble: () => calls.push("double"),
    timer: clock.timer,
  });
  click.handleClick();
  assert.deepEqual(calls, []);
  clock.fire();
  assert.deepEqual(calls, ["single"]);
});

test("double click within the window fires only onDouble", () => {
  const calls: string[] = [];
  const clock = manualTimer();
  const click = createSingleDoubleClick({
    onSingle: () => calls.push("single"),
    onDouble: () => calls.push("double"),
    timer: clock.timer,
  });
  click.handleClick();
  click.handleClick();
  click.handleDoubleClick();
  assert.equal(clock.hasPending(), false);
  clock.fire();
  assert.deepEqual(calls, ["double"]);
});

test("clicks spaced beyond the window fire onSingle twice", () => {
  const calls: string[] = [];
  const clock = manualTimer();
  const click = createSingleDoubleClick({
    onSingle: () => calls.push("single"),
    onDouble: () => calls.push("double"),
    timer: clock.timer,
  });
  click.handleClick();
  clock.fire();
  click.handleClick();
  clock.fire();
  assert.deepEqual(calls, ["single", "single"]);
});

test("cancel and dispose suppress a pending single", () => {
  const calls: string[] = [];
  const clock = manualTimer();
  const click = createSingleDoubleClick({
    onSingle: () => calls.push("single"),
    onDouble: () => calls.push("double"),
    timer: clock.timer,
  });
  click.handleClick();
  click.cancel();
  clock.fire();
  assert.deepEqual(calls, []);

  click.handleClick();
  click.dispose();
  clock.fire();
  assert.deepEqual(calls, []);
  assert.equal(clock.cleared(), 2);
});
