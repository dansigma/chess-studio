import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MISTAKE_EXERCISES_OWNER_KEY,
} from "./local-cache.ts";
import {
  dueExercises,
  hydrateExercises,
  isMistakeExercisesOwnedBy,
  mergeNewExercises,
  normalizeExercises,
  readLocalExercises,
  recordAttempt,
  saveExercises,
  writeLocalExercises,
  writeMistakeExercisesOwner,
  type MistakeExercisesMap,
} from "./mistake-exercises-store.ts";
import type { MistakeExercise } from "../chess/mistake-exercises.ts";

const storage = new Map<string, string>();

function installWindow(): void {
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, String(value));
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    },
  };
}

installWindow();

function makeExercise(key: string, createdAt: string): MistakeExercise {
  return {
    key,
    fen: `fen-for-${key}`,
    solutionUci: ["e2e4"],
    bestPv: ["e2e4"],
    playedUci: "d2d4",
    label: "blunder",
    phase: "middlegame",
    lossCp: 250,
    beforePawns: 0.3,
    afterPawns: -2.2,
    motif: "positional",
    createdAt,
  };
}

describe("normalizeExercises", () => {
  it("returns empty object for invalid inputs", () => {
    assert.deepEqual(normalizeExercises(null), {});
    assert.deepEqual(normalizeExercises("invalid"), {});
    assert.deepEqual(normalizeExercises([]), {});
  });

  it("keeps exercises and normalizes srs with clamps", () => {
    const raw = {
      "mx:abc": {
        exercise: makeExercise("mx:abc", "2026-10-21T00:00:00.000Z"),
        srs: {
          lastReviewedAt: "2026-10-21T00:00:00.000Z",
          intervalDays: 0,
          easeFactor: 1.1,
          dueDate: "2026-10-22T00:00:00.000Z",
          mistakeCount: -1,
        },
      },
      "mx:bare": { exercise: makeExercise("mx:bare", "2026-10-21T00:00:00.000Z"), srs: null },
      broken: { nope: true },
    };
    const normalized = normalizeExercises(raw);
    assert.equal(normalized["mx:abc"].srs?.intervalDays, 1);
    assert.equal(normalized["mx:abc"].srs?.easeFactor, 1.3);
    assert.equal(normalized["mx:abc"].srs?.mistakeCount, 0);
    assert.equal(normalized["mx:bare"].srs, null);
    assert.equal("broken" in normalized, false);
  });
});

describe("mergeNewExercises", () => {
  it("adds 3 blunders and adds none on re-run (idempotent by key)", () => {
    const incoming = [
      makeExercise("mx:a", "2026-10-21T00:00:00.000Z"),
      makeExercise("mx:b", "2026-10-21T00:00:00.000Z"),
      makeExercise("mx:c", "2026-10-21T00:00:00.000Z"),
    ];
    const first = mergeNewExercises({}, incoming);
    assert.equal(Object.keys(first).length, 3);
    assert.equal(first["mx:a"].srs, null);
    const second = mergeNewExercises(first, incoming);
    assert.equal(Object.keys(second).length, 3);
  });

  it("keeps the existing schedule when a key repeats with a new payload", () => {
    const existing: MistakeExercisesMap = {
      "mx:a": {
        exercise: makeExercise("mx:a", "2026-10-20T00:00:00.000Z"),
        srs: {
          lastReviewedAt: "2026-10-21T00:00:00.000Z",
          intervalDays: 6,
          easeFactor: 2.5,
          dueDate: "2026-10-27T00:00:00.000Z",
          mistakeCount: 0,
        },
      },
    };
    const changed = { ...makeExercise("mx:a", "2026-10-21T12:00:00.000Z"), lossCp: 400 };
    const merged = mergeNewExercises(existing, [changed]);
    assert.equal(Object.keys(merged).length, 1);
    assert.equal(merged["mx:a"].srs?.intervalDays, 6);
    assert.equal(merged["mx:a"].exercise.lossCp, 250);
  });

  it("caps at 300, evicting oldest mastered entries first then oldest overall", () => {
    const existing: MistakeExercisesMap = {};
    // 100 mastered (interval >= 21) with staggered review times.
    for (let i = 0; i < 100; i += 1) {
      const key = `mx:mastered-${String(i).padStart(3, "0")}`;
      existing[key] = {
        exercise: makeExercise(key, `2026-01-01T00:${String(i % 60).padStart(2, "0")}:00.000Z`),
        srs: {
          lastReviewedAt: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
          intervalDays: 21,
          easeFactor: 2.5,
          dueDate: "2026-10-01T00:00:00.000Z",
          mistakeCount: 0,
        },
      };
    }
    // 200 young entries (interval 1).
    for (let i = 0; i < 200; i += 1) {
      const key = `mx:young-${String(i).padStart(3, "0")}`;
      existing[key] = {
        exercise: makeExercise(key, `2026-10-01T00:${String(i % 60).padStart(2, "0")}:00.000Z`),
        srs: {
          lastReviewedAt: "2026-10-10T00:00:00.000Z",
          intervalDays: 1,
          easeFactor: 2.5,
          dueDate: "2026-10-11T00:00:00.000Z",
          mistakeCount: 1,
        },
      };
    }
    const incoming = [
      makeExercise("mx:new-1", "2026-10-21T00:00:00.000Z"),
      makeExercise("mx:new-2", "2026-10-21T00:00:00.000Z"),
      makeExercise("mx:new-3", "2026-10-21T00:00:00.000Z"),
      makeExercise("mx:new-4", "2026-10-21T00:00:00.000Z"),
      makeExercise("mx:new-5", "2026-10-21T00:00:00.000Z"),
    ];
    const merged = mergeNewExercises(existing, incoming);
    assert.equal(Object.keys(merged).length, 300);
    // The 5 oldest mastered (Sep 01..) are evicted; the new keys survive.
    for (const key of ["mx:new-1", "mx:new-2", "mx:new-3", "mx:new-4", "mx:new-5"]) {
      assert.ok(merged[key], `${key} must survive eviction`);
    }
    const remainingMastered = Object.keys(merged).filter((key) => key.startsWith("mx:mastered-"));
    assert.equal(remainingMastered.length, 95);
  });

  it("evicts oldest overall when nothing is mastered", () => {
    const existing: MistakeExercisesMap = {};
    for (let i = 0; i < 300; i += 1) {
      const day = String((i % 28) + 1).padStart(2, "0");
      const key = `mx:old-${String(i).padStart(3, "0")}`;
      existing[key] = {
        exercise: makeExercise(key, `2026-10-${day}T00:00:00.000Z`),
        srs: null,
      };
    }
    const merged = mergeNewExercises(existing, [makeExercise("mx:fresh", "2026-10-21T00:00:00.000Z")]);
    assert.equal(Object.keys(merged).length, 300);
    assert.ok(merged["mx:fresh"], "fresh entry must survive");
    assert.equal("mx:old-000" in merged, false);
  });
});

describe("recordAttempt", () => {
  it("pushes dueDate out on correct and back to one day on incorrect", () => {
    const start: MistakeExercisesMap = {
      "mx:a": {
        exercise: makeExercise("mx:a", "2026-10-21T00:00:00.000Z"),
        srs: {
          lastReviewedAt: "2026-10-21T00:00:00.000Z",
          intervalDays: 6,
          easeFactor: 2.5,
          dueDate: "2026-10-27T00:00:00.000Z",
          mistakeCount: 0,
        },
      },
    };
    const now = new Date("2026-10-22T00:00:00.000Z");
    const before = start["mx:a"].srs?.dueDate ?? "";
    const good = recordAttempt(start, "mx:a", true, now);
    assert.ok((good["mx:a"].srs?.dueDate ?? "") > before);
    assert.ok((good["mx:a"].srs?.intervalDays ?? 0) > 6);
    const bad = recordAttempt(start, "mx:a", false, now);
    assert.equal(bad["mx:a"].srs?.intervalDays, 1);
    assert.equal(bad["mx:a"].srs?.dueDate, "2026-10-23T00:00:00.000Z");
  });

  it("leaves the map unchanged for unknown keys", () => {
    const start: MistakeExercisesMap = {};
    assert.equal(recordAttempt(start, "mx:missing", true), start);
  });
});

describe("dueExercises", () => {
  it("returns never-attempted first, then by due date", () => {
    const map: MistakeExercisesMap = {
      "mx:due-late": {
        exercise: makeExercise("mx:due-late", "2026-10-20T00:00:00.000Z"),
        srs: {
          lastReviewedAt: "2026-10-20T00:00:00.000Z",
          intervalDays: 1,
          easeFactor: 2.5,
          dueDate: "2026-10-21T00:00:00.000Z",
          mistakeCount: 1,
        },
      },
      "mx:fresh": {
        exercise: makeExercise("mx:fresh", "2026-10-21T00:00:00.000Z"),
        srs: null,
      },
      "mx:future": {
        exercise: makeExercise("mx:future", "2026-10-20T00:00:00.000Z"),
        srs: {
          lastReviewedAt: "2026-10-20T00:00:00.000Z",
          intervalDays: 6,
          easeFactor: 2.5,
          dueDate: "2026-12-01T00:00:00.000Z",
          mistakeCount: 0,
        },
      },
    };
    const due = dueExercises(map, new Date("2026-10-22T00:00:00.000Z"));
    assert.deepEqual(
      due.map((entry) => entry.exercise.key),
      ["mx:fresh", "mx:due-late"],
    );
  });
});

describe("mistake exercises ownership and local storage", () => {
  it("handles anonymous access and isolation between users", async () => {
    storage.clear();
    const map: MistakeExercisesMap = {
      "mx:a": {
        exercise: makeExercise("mx:a", "2026-10-21T00:00:00.000Z"),
        srs: null,
      },
    };

    await hydrateExercises(null);
    writeLocalExercises(map);
    assert.deepEqual(readLocalExercises(), map);

    writeMistakeExercisesOwner("user-a");
    assert.equal(isMistakeExercisesOwnedBy("user-a"), true);
    assert.equal(isMistakeExercisesOwnedBy("user-b"), false);

    await saveExercises(map, "user-a");
    assert.equal(storage.get(MISTAKE_EXERCISES_OWNER_KEY), "user-a");
  });
});
