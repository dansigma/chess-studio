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

/** Production key shape: `mx:<fenKey(fen)>` — carries spaces and `/`. */
function keyOf(fen: string): string {
  return `mx:${fenKeyOf(fen)}`;
}

function fenKeyOf(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

/**
 * What react-chessboard does on the first move: `querySelector` on the
 * square id `#puzzle-<id>-square-<sq>` built unescaped. Digits, lowercase
 * hex and `-` need no escaping and are always valid selector text.
 */
function assertBoardSafeId(id: string): void {
  assert.match(id, /^mx-h-[0-9a-f]+$/);
}

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
  const key = `mx:${fenKeyOf(START)}`;
  const converted = exerciseToPuzzle(exercise({ key, fen: START, solutionUci: ["e2e4"] }));
  assert.ok(converted);
  assert.equal(converted.id, puzzleIdForExercise(key));
  // QA: production keys carry spaces and `/` — the board id must stay a
  // valid CSS selector (react-chessboard runs querySelector on it).
  assertBoardSafeId(converted.id);
  assert.equal(converted.rating, 1500);
  assert.deepEqual(converted.themes, []);
  const compiled = compilePuzzle(converted);
  assert.deepEqual(compiled.uci, ["e2e4"]);
});

test("a 3-ply line converts and compilePuzzle accepts it", () => {
  const converted = exerciseToPuzzle(
    exercise({ key: keyOf(START), fen: START, solutionUci: ["e2e4", "e7e5", "g1f3"] }),
  );
  assert.ok(converted);
  assert.equal(converted.moves.length, 3);
  const compiled = compilePuzzle(converted);
  assert.equal(compiled.uci.length, 3);
});

test("an illegal second ply converts to null", () => {
  assert.equal(exerciseToPuzzle(exercise({ key: keyOf(START), fen: START, solutionUci: ["e2e4", "e2e4", "g1f3"] })), null);
});

test("an even-length solution converts to null", () => {
  assert.equal(exerciseToPuzzle(exercise({ key: keyOf(START), fen: START, solutionUci: ["e2e4", "e7e5"] })), null);
  assert.equal(exerciseToPuzzle(exercise({ key: keyOf(START), fen: START, solutionUci: [] })), null);
});

test("every converted fixture passes compilePuzzle", () => {
  const fixtures = [
    exercise({ key: keyOf(START), fen: START, solutionUci: ["e2e4"] }),
    exercise({ key: keyOf(MATE), fen: MATE, solutionUci: ["a1a8"], playedUci: "h2h3", label: "mistake" }),
    exercise({ key: keyOf(CAPTURE), fen: CAPTURE, solutionUci: ["e1e6"], playedUci: "e1e2", label: "miss" }),
    exercise({ key: keyOf(START), fen: START, solutionUci: ["e2e4", "e7e5", "g1f3"] }),
  ];
  for (const fixture of fixtures) {
    const converted = exerciseToPuzzle(fixture);
    assert.ok(converted, fixture.key);
    assert.doesNotThrow(() => compilePuzzle(converted), fixture.key);
  }
});

test("mistakesQueue skips excluded and unconvertible entries", () => {
  const map = storedMap([
    exercise({ key: keyOf(START), fen: START, solutionUci: ["e2e4"] }),
    exercise({ key: `${keyOf(START)}#bad`, fen: START, solutionUci: ["e2e4", "e7e5"] }),
    exercise({ key: keyOf(MATE), fen: MATE, solutionUci: ["a1a8"] }),
  ]);
  // Exclude accepts both board-safe puzzle ids and raw exercise keys.
  const good = mistakesQueue(map, new Set(), new Date(NOW))[0];
  assert.ok(good);
  const queue = mistakesQueue(map, new Set([good.puzzle.id, keyOf(START)]), new Date(NOW));
  assert.deepEqual(queue.map((entry) => entry.puzzle.id), [puzzleIdForExercise(keyOf(MATE))]);
});

test("puzzle ids are board-safe and map back to exercise keys", () => {
  // Production keys carry spaces and `/` — the id must be a valid CSS
  // selector and must round-trip to the exact exercise key for recordAttempt.
  for (const fen of [START, MATE, CAPTURE]) {
    const key = keyOf(fen);
    assert.ok(key.includes(" ") && key.includes("/"), key);
    const id = puzzleIdForExercise(key);
    assertBoardSafeId(id);
    assert.equal(exerciseKeyForPuzzle(id), key);
  }
  // Legacy colon-stripped ids (pre-hex) still map back.
  assert.equal(exerciseKeyForPuzzle("mx-first"), "mx:first");
  assert.equal(exerciseKeyForPuzzle("plain-id"), "plain-id");
});

test("nextDueDate returns the earliest due date or null", () => {
  assert.equal(nextDueDate({}), null);
  assert.equal(nextDueDate(storedMap([exercise({ key: keyOf(START) })])), null);
  const keyA = `${keyOf(START)}#a`;
  const keyB = keyOf(MATE);
  const map = storedMap([exercise({ key: keyA }), exercise({ key: keyB })]);
  map[keyA].srs = {
    lastReviewedAt: NOW,
    intervalDays: 6,
    easeFactor: 2.5,
    dueDate: "2026-11-02T00:00:00.000Z",
    mistakeCount: 0,
  };
  map[keyB].srs = {
    lastReviewedAt: NOW,
    intervalDays: 1,
    easeFactor: 2.5,
    dueDate: "2026-10-27T00:00:00.000Z",
    mistakeCount: 1,
  };
  assert.equal(nextDueDate(map), "2026-10-27T00:00:00.000Z");
});
