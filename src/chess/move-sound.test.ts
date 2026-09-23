import assert from "node:assert/strict";
import test from "node:test";
import { shouldPlayMoveSound } from "./move-sound.ts";

test("sound plays only when enabled and the position advances", () => {
  assert.equal(shouldPlayMoveSound(false, [], [0]), false);
  assert.equal(shouldPlayMoveSound(true, [0], [0]), false);
  assert.equal(shouldPlayMoveSound(true, [0, 1], [0]), false);
  assert.equal(shouldPlayMoveSound(true, [0], []), false);
  assert.equal(shouldPlayMoveSound(true, [0], [0, 0]), true);
  assert.equal(shouldPlayMoveSound(true, [0], [1]), true);
});
