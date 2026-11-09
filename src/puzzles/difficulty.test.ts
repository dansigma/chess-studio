import assert from "node:assert/strict";
import test from "node:test";
import { DIFFICULTIES, difficultyTarget, inDifficultyBand, parseDifficulty } from "./difficulty";

test("parseDifficulty accepts the three bands and rejects everything else", () => {
  for (const value of DIFFICULTIES) {
    assert.equal(parseDifficulty(value), value);
  }
  for (const bad of ["", "easy", "Beginner", "ADVANCED", "1500", null, undefined]) {
    assert.equal(parseDifficulty(bad), null);
  }
});

test("bands are contiguous and cover 0 to 3000", () => {
  assert.equal(inDifficultyBand(1199, "beginner"), true);
  assert.equal(inDifficultyBand(1200, "beginner"), false);
  assert.equal(inDifficultyBand(1200, "intermediate"), true);
  assert.equal(inDifficultyBand(1799, "intermediate"), true);
  assert.equal(inDifficultyBand(1800, "intermediate"), false);
  assert.equal(inDifficultyBand(1800, "advanced"), true);
  assert.equal(inDifficultyBand(3000, "advanced"), true);
});

test("difficultyTarget is inside its own band", () => {
  for (const value of DIFFICULTIES) {
    assert.equal(inDifficultyBand(difficultyTarget(value), value), true);
  }
});
