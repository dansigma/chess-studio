import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyProgress } from "./engine.ts";
import { mergePuzzleProgress } from "./progress.ts";
import type { PuzzleProgress } from "./types.ts";

// SIG-887: merge harness mirrors src/lib/local-cache.test.ts — a Map-backed
// localStorage is installed after the imports so module init sees no browser.
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
    },
  };
}

installWindow();

function progress(overrides: Partial<PuzzleProgress>): PuzzleProgress {
  return { ...emptyProgress(), ...overrides };
}

describe("mergePuzzleProgress", () => {
  it("takes the max for rating, xp, solved, failed, bestStreak and rushBest", () => {
    const local = progress({
      rating: 1500,
      xp: 100,
      solved: 10,
      failed: 2,
      bestStreak: 5,
      rushBest: 7,
    });
    const remote = progress({
      rating: 1400,
      xp: 300,
      solved: 4,
      failed: 9,
      bestStreak: 8,
      rushBest: 3,
    });
    const merged = mergePuzzleProgress(local, remote, null, null);
    assert.equal(merged.rating, 1500);
    assert.equal(merged.xp, 300);
    assert.equal(merged.solved, 10);
    assert.equal(merged.failed, 9);
    assert.equal(merged.bestStreak, 8);
    assert.equal(merged.rushBest, 7);
  });

  it("takes streak and daily from the side with the most recent updated_at (remote newer)", () => {
    const local = progress({ streak: 2, daily: "2026-10-01" });
    const remote = progress({ streak: 6, daily: "2026-10-04" });
    const merged = mergePuzzleProgress(
      local,
      remote,
      "2026-10-04T12:00:00.000Z",
      "2026-10-01T12:00:00.000Z",
    );
    assert.equal(merged.streak, 6);
    assert.equal(merged.daily, "2026-10-04");
  });

  it("takes streak and daily from the side with the most recent updated_at (local newer)", () => {
    const local = progress({ streak: 9, daily: "2026-10-05" });
    const remote = progress({ streak: 1, daily: "2026-10-02" });
    const merged = mergePuzzleProgress(
      local,
      remote,
      "2026-10-02T12:00:00.000Z",
      "2026-10-05T12:00:00.000Z",
    );
    assert.equal(merged.streak, 9);
    assert.equal(merged.daily, "2026-10-05");
  });

  it("without timestamps prefers remote daily and keeps local streak", () => {
    const local = progress({ streak: 4, daily: "2026-10-01" });
    const remote = progress({ streak: 7, daily: "2026-10-04" });
    const merged = mergePuzzleProgress(local, remote, null, null);
    assert.equal(merged.streak, 4);
    assert.equal(merged.daily, "2026-10-04");
  });

  it("unions history deduped by id, sorted by at desc", () => {
    const local = progress({
      history: [
        { id: "a", mode: "rated", success: true, at: 100, delta: 10 },
        { id: "b", mode: "rated", success: true, at: 200, delta: 12 },
      ],
    });
    const remote = progress({
      history: [
        { id: "b", mode: "rated", success: false, at: 150, delta: -8 },
        { id: "c", mode: "streak", success: true, at: 300, delta: 0 },
      ],
    });
    const merged = mergePuzzleProgress(local, remote, null, null);
    assert.deepEqual(
      merged.history.map((entry) => entry.id),
      ["c", "b", "a"],
    );
    // The surviving "b" is the newest write for that id (at 200).
    assert.equal(
      merged.history.find((entry) => entry.id === "b")?.at,
      200,
    );
  });

  it("caps history through normalizeProgress", () => {
    const localHistory = Array.from({ length: 20 }, (_, index) => ({
      id: `local-${index}`,
      mode: "rated" as const,
      success: true,
      at: 1000 + index,
      delta: 1,
    }));
    const remoteHistory = Array.from({ length: 20 }, (_, index) => ({
      id: `remote-${index}`,
      mode: "rated" as const,
      success: true,
      at: 2000 + index,
      delta: 1,
    }));
    const merged = mergePuzzleProgress(
      progress({ history: localHistory }),
      progress({ history: remoteHistory }),
      null,
      null,
    );
    assert.equal(merged.history.length, 20);
    assert.equal(merged.history[0]?.at, 2019);
  });
});
