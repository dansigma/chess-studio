import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PUZZLE_PROGRESS_KEY } from "../lib/local-cache.ts";
import { emptyProgress, normalizeProgress } from "./engine.ts";
import {
  hydratePuzzleProgress,
  mergePuzzleProgress,
  PUZZLE_PROGRESS_OWNER_KEY,
} from "./progress.ts";
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

  it("keeps a newer local daily when only the account timestamp is known", () => {
    const local = progress({ streak: 0, daily: "2026-10-05" });
    const remote = progress({ streak: 7, daily: "2026-10-04" });
    const merged = mergePuzzleProgress(
      local,
      remote,
      "2026-10-04T12:00:00.000Z",
      null,
    );
    assert.equal(merged.streak, 7);
    assert.equal(merged.daily, "2026-10-05");
  });

  it("takes the account streak when only the account timestamp is known", () => {
    const local = progress({ streak: 0, daily: "2026-10-01" });
    const remote = progress({ streak: 7, daily: "2026-10-04" });
    const merged = mergePuzzleProgress(
      local,
      remote,
      "2026-10-04T12:00:00.000Z",
      null,
    );
    assert.equal(merged.streak, 7);
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
    // The surviving "b" is the newest write for that id (at 200) — the
    // whole winning entry, not just its timestamp.
    assert.deepEqual(
      merged.history.find((entry) => entry.id === "b"),
      { id: "b", mode: "rated", success: true, at: 200, delta: 12 },
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

  it("prefers the account side when both timestamps tie", () => {
    const local = progress({ streak: 2, daily: "2026-10-01" });
    const remote = progress({ streak: 6, daily: "2026-10-04" });
    const merged = mergePuzzleProgress(
      local,
      remote,
      "2026-10-03T12:00:00.000Z",
      "2026-10-03T12:00:00.000Z",
    );
    assert.equal(merged.streak, 6);
    assert.equal(merged.daily, "2026-10-04");
  });

  it("is idempotent on normalized progress across timestamp shapes", () => {
    const normalized = normalizeProgress(
      progress({
        rating: 1500,
        xp: 90,
        solved: 5,
        failed: 1,
        streak: 4,
        bestStreak: 6,
        rushBest: 3,
        daily: "2026-10-04",
        history: [
          { id: "c", mode: "streak", success: true, at: 300, delta: 0 },
          { id: "b", mode: "rated", success: true, at: 200, delta: 12 },
          { id: "a", mode: "rated", success: false, at: 100, delta: -8 },
        ],
      }),
    );
    const shapes: Array<[string | null, string | null]> = [
      ["2026-10-04T12:00:00.000Z", "2026-10-03T12:00:00.000Z"],
      ["2026-10-04T12:00:00.000Z", null],
      [null, "2026-10-03T12:00:00.000Z"],
      [null, null],
    ];
    for (const [remoteUpdatedAt, localUpdatedAt] of shapes) {
      assert.deepEqual(
        mergePuzzleProgress(normalized, normalized, remoteUpdatedAt, localUpdatedAt),
        normalized,
      );
    }
  });

  it("is a fixed point: merging a merge result with itself changes nothing", () => {
    const a = progress({
      rating: 1400,
      streak: 1,
      daily: "2026-10-01",
      history: [{ id: "a", mode: "rated", success: true, at: 100, delta: 10 }],
    });
    const b = progress({
      rating: 1500,
      streak: 6,
      daily: "2026-10-04",
      history: [
        { id: "a", mode: "rated", success: false, at: 50, delta: -8 },
        { id: "b", mode: "streak", success: true, at: 300, delta: 0 },
      ],
    });
    const remoteUpdatedAt = "2026-10-04T12:00:00.000Z";
    const localUpdatedAt = "2026-10-01T12:00:00.000Z";
    const merged = mergePuzzleProgress(a, b, remoteUpdatedAt, localUpdatedAt);
    assert.deepEqual(
      mergePuzzleProgress(merged, merged, remoteUpdatedAt, localUpdatedAt),
      merged,
    );
    assert.deepEqual(
      mergePuzzleProgress(merged, merged, remoteUpdatedAt, null),
      merged,
    );
  });

  it("merges motifs per theme by max attempts and stays idempotent", () => {
    const local = progress({
      motifs: {
        fork: { attempts: 5, solved: 4, timedAttempts: 5, totalMs: 40_000, recent: "11110" },
        pin: { attempts: 9, solved: 3, timedAttempts: 0, totalMs: 0, recent: "000000000" },
      },
    });
    const remote = progress({
      motifs: {
        fork: { attempts: 12, solved: 6, timedAttempts: 12, totalMs: 96_000, recent: "1010101010" },
        skewer: { attempts: 3, solved: 3, timedAttempts: 3, totalMs: 9_000, recent: "111" },
      },
    });
    const merged = mergePuzzleProgress(local, remote, null, null);
    // Per theme the entry with more attempts wins.
    assert.deepEqual(merged.motifs.fork, remote.motifs.fork);
    assert.deepEqual(merged.motifs.pin, local.motifs.pin);
    assert.deepEqual(merged.motifs.skewer, remote.motifs.skewer);
    assert.deepEqual(mergePuzzleProgress(merged, merged, null, null), merged);
  });

  it("loads old progress without motifs as an empty table", () => {
    const raw = JSON.parse(JSON.stringify(progress({ solved: 4 })));
    delete raw.motifs;
    const loaded = normalizeProgress(raw);
    assert.deepEqual(loaded.motifs, {});
    const merged = mergePuzzleProgress(progress({ solved: 4 }), normalizeProgress(raw), null, null);
    assert.deepEqual(merged.motifs, {});
  });
});

describe("hydratePuzzleProgress ownership", () => {
  it("drops foreign-owned local data instead of adopting it", async () => {
    storage.clear();
    storage.set(
      PUZZLE_PROGRESS_KEY,
      JSON.stringify(progress({ rating: 1600, streak: 5 })),
    );
    storage.set(PUZZLE_PROGRESS_OWNER_KEY, "user-a");
    const loaded = await hydratePuzzleProgress("user-b");
    assert.deepEqual(loaded, emptyProgress());
    assert.equal(storage.get(PUZZLE_PROGRESS_KEY) ?? null, null);
  });

  it("keeps unmarked anonymous data mergeable", async () => {
    storage.clear();
    storage.set(
      PUZZLE_PROGRESS_KEY,
      JSON.stringify(progress({ rating: 1600 })),
    );
    const loaded = await hydratePuzzleProgress("user-b");
    assert.equal(loaded.rating, 1600);
  });
});
