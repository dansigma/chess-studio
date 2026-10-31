import assert from "node:assert/strict";
import test from "node:test";
import type { MistakeExercise } from "@/src/chess/mistake-exercises";
import type { MistakeExercisesMap } from "@/src/lib/mistake-exercises-store";
import { compilePuzzle } from "./engine.ts";
import {
  exerciseKeyForPuzzle,
  exerciseToPuzzle,
  mistakesQueue,
  nextDueDate,
  puzzleIdForExercise,
} from "./mistake-puzzle.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MATE = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const CAPTURE = "4k3/8/4b3/8/8/8/8/4R1K1 w - - 0 1";
const NOW = "2026-10-26T00:00:00.000Z";

function exercise(overrides: Partial<MistakeExercise> & { key: string }): MistakeExercise {
  return {
    fen: START,
    solutionUci: ["e2e4"],
    bestPv: ["e2e4"],
    playedUci: "d2d4",
    label: "blunder",
    phase: "middlegame",
    lossCp: 100,
    beforePawns: 0.5,
    afterPawns: -0.5,
    motif: "positional",
    createdAt: NOW,
    ...overrides,
  };
}

function storedMap(entries: MistakeExercise[]): MistakeExercisesMap {
  const map: MistakeExercisesMap = {};
  for (const entry of entries) {
    map[entry.key] = { exercise: entry, srs: null };
  }
  return map;
}

test("a 1-ply line converts and compilePuzzle accepts it", () => {
  const converted = exerciseToPuzzle(exercise({ key: "mx:start", fen: START, solutionUci: ["e2e4"] }));
  assert.ok(converted);
  assert.equal(converted.id, "mx-start");
  assert.equal(converted.rating, 1500);
  assert.deepEqual(converted.themes, []);
  const compiled = compilePuzzle(converted);
  assert.deepEqual(compiled.uci, ["e2e4"]);
});

test("a 3-ply line converts and compilePuzzle accepts it", () => {
  const converted = exerciseToPuzzle(
    exercise({ key: "mx:line3", fen: START, solutionUci: ["e2e4", "e7e5", "g1f3"] }),
  );
  assert.ok(converted);
  assert.equal(converted.moves.length, 3);
  const compiled = compilePuzzle(converted);
  assert.equal(compiled.uci.length, 3);
});

test("an illegal second ply converts to null", () => {
  assert.equal(exerciseToPuzzle(exercise({ key: "mx:bad", fen: START, solutionUci: ["e2e4", "e2e4", "g1f3"] })), null);
});

test("an even-length solution converts to null", () => {
  assert.equal(exerciseToPuzzle(exercise({ key: "mx:even", fen: START, solutionUci: ["e2e4", "e7e5"] })), null);
  assert.equal(exerciseToPuzzle(exercise({ key: "mx:empty", fen: START, solutionUci: [] })), null);
});

test("every converted fixture passes compilePuzzle", () => {
  const fixtures = [
    exercise({ key: "mx:start", fen: START, solutionUci: ["e2e4"] }),
    exercise({ key: "mx:mate", fen: MATE, solutionUci: ["a1a8"], playedUci: "h2h3", label: "mistake" }),
    exercise({ key: "mx:cap", fen: CAPTURE, solutionUci: ["e1e6"], playedUci: "e1e2", label: "miss" }),
    exercise({ key: "mx:line3", fen: START, solutionUci: ["e2e4", "e7e5", "g1f3"] }),
  ];
  for (const fixture of fixtures) {
    const converted = exerciseToPuzzle(fixture);
    assert.ok(converted, fixture.key);
    assert.doesNotThrow(() => compilePuzzle(converted), fixture.key);
  }
});

test("mistakesQueue skips excluded and unconvertible entries", () => {
  const map = storedMap([
    exercise({ key: "mx:good", fen: START, solutionUci: ["e2e4"] }),
    exercise({ key: "mx:bad", fen: START, solutionUci: ["e2e4", "e7e5"] }),
    exercise({ key: "mx:mate", fen: MATE, solutionUci: ["a1a8"] }),
  ]);
  // Exclude accepts both board-safe puzzle ids and raw exercise keys.
  const queue = mistakesQueue(map, new Set(["mx-good", "mx:good"]), new Date(NOW));
  assert.deepEqual(queue.map((entry) => entry.puzzle.id), ["mx-mate"]);
});

test("puzzle ids are board-safe and map back to exercise keys", () => {
  assert.equal(puzzleIdForExercise("mx:start"), "mx-start");
  assert.equal(exerciseKeyForPuzzle("mx-start"), "mx:start");
  assert.equal(exerciseKeyForPuzzle("plain-id"), "plain-id");
});

test("nextDueDate returns the earliest due date or null", () => {
  assert.equal(nextDueDate({}), null);
  assert.equal(nextDueDate(storedMap([exercise({ key: "mx:fresh" })])), null);
  const map = storedMap([exercise({ key: "mx:a" }), exercise({ key: "mx:b" })]);
  map["mx:a"].srs = {
    lastReviewedAt: NOW,
    intervalDays: 6,
    easeFactor: 2.5,
    dueDate: "2026-11-02T00:00:00.000Z",
    mistakeCount: 0,
  };
  map["mx:b"].srs = {
    lastReviewedAt: NOW,
    intervalDays: 1,
    easeFactor: 2.5,
    dueDate: "2026-10-27T00:00:00.000Z",
    mistakeCount: 1,
  };
  assert.equal(nextDueDate(map), "2026-10-27T00:00:00.000Z");
});
