import assert from "node:assert/strict";
import test from "node:test";
import { shouldAutoQueen } from "./promotion.ts";

test("auto-queen only when enabled and Alt is not held", () => {
  assert.equal(shouldAutoQueen(false, false), false);
  assert.equal(shouldAutoQueen(false, true), false);
  assert.equal(shouldAutoQueen(true, false), true);
  assert.equal(shouldAutoQueen(true, true), false);
});
