import assert from "node:assert/strict";
import test from "node:test";
import type { MistakeExercise } from "@/src/chess/mistake-exercises";
import { exerciseCountsByPhase } from "./mistake-exercise-counts.ts";
import type { MistakeExercisesMap } from "./mistake-exercises-store.ts";

function entry(key: string, label: MistakeExercise["label"], phase: MistakeExercise["phase"], fromOpponent?: boolean) {
  return {
    exercise: {
      key, fen: "", solutionUci: [], bestPv: [], playedUci: "", label, phase, lossCp: 0,
      beforePawns: 0, afterPawns: 0, motif: "positional", createdAt: "", fromOpponent,
    } as MistakeExercise,
    srs: null,
  };
}

test("exerciseCountsByPhase buckets by phase x label and skips opponent mistakes", () => {
  const map: MistakeExercisesMap = {
    a: entry("a", "blunder", "opening"),
    b: entry("b", "blunder", "opening"),
    c: entry("c", "mistake", "endgame"),
    d: entry("d", "miss", "middlegame", false),
    e: entry("e", "blunder", "opening", true),
  };
  const counts = exerciseCountsByPhase(map);
  assert.equal(counts.opening.blunder, 2);
  assert.equal(counts.endgame.mistake, 1);
  assert.equal(counts.middlegame.miss, 1);
  assert.equal(counts.opening.mistake, 0);
});
