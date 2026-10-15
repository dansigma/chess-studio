import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REPERTOIRE_PROGRESS_OWNER_KEY,
} from "./local-cache.ts";
import {
  hydrateRepertoireProgress,
  isRepertoireProgressOwnedBy,
  mergeRepertoireProgress,
  normalizeRepertoireProgress,
  readLocalRepertoireProgress,
  saveRepertoireProgress,
  writeLocalRepertoireProgress,
  writeRepertoireProgressOwner,
  type RepertoireProgress,
} from "./repertoire-progress.ts";

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

describe("normalizeRepertoireProgress", () => {
  it("returns empty object for invalid inputs", () => {
    assert.deepEqual(normalizeRepertoireProgress(null), {});
    assert.deepEqual(normalizeRepertoireProgress("invalid"), {});
    assert.deepEqual(normalizeRepertoireProgress([]), {});
  });

  it("normalizes and clamps values correctly", () => {
    const raw = {
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP:e7e5": {
        lastReviewedAt: "2026-10-13T00:00:00.000Z",
        intervalDays: 0,
        easeFactor: 1.1,
        dueDate: "2026-10-14T00:00:00.000Z",
        mistakeCount: -1,
      },
    };
    const normalized = normalizeRepertoireProgress(raw);
    const item = normalized["rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP:e7e5"];
    assert.ok(item);
    assert.equal(item.intervalDays, 1); // clamped min 1
    assert.equal(item.easeFactor, 1.3); // clamped min 1.3
    assert.equal(item.mistakeCount, 0); // clamped min 0
  });
});

describe("mergeRepertoireProgress", () => {
  it("merges remote items keeping the most recently reviewed timestamp", () => {
    const local: RepertoireProgress = {
      move1: {
        lastReviewedAt: "2026-10-13T10:00:00.000Z",
        intervalDays: 6,
        easeFactor: 2.5,
        dueDate: "2026-10-19T10:00:00.000Z",
        mistakeCount: 0,
      },
      move2: {
        lastReviewedAt: "2026-10-10T10:00:00.000Z",
        intervalDays: 1,
        easeFactor: 2.3,
        dueDate: "2026-10-11T10:00:00.000Z",
        mistakeCount: 1,
      },
    };
    const remote: RepertoireProgress = {
      move2: {
        lastReviewedAt: "2026-10-12T10:00:00.000Z",
        intervalDays: 6,
        easeFactor: 2.5,
        dueDate: "2026-10-18T10:00:00.000Z",
        mistakeCount: 1,
      },
      move3: {
        lastReviewedAt: "2026-10-11T10:00:00.000Z",
        intervalDays: 1,
        easeFactor: 2.5,
        dueDate: "2026-10-12T10:00:00.000Z",
        mistakeCount: 0,
      },
    };

    const merged = mergeRepertoireProgress(local, remote);
    assert.equal(merged.move1.intervalDays, 6);
    assert.equal(merged.move2.intervalDays, 6); // newer remote took precedence
    assert.equal(merged.move2.lastReviewedAt, "2026-10-12T10:00:00.000Z");
    assert.equal(merged.move3.intervalDays, 1);
  });
});

describe("repertoire progress ownership and local storage", () => {
  it("handles anonymous access and isolation between users", async () => {
    storage.clear();
    const progress: RepertoireProgress = {
      "pos1:e2e4": {
        lastReviewedAt: "2026-10-13T00:00:00.000Z",
        intervalDays: 1,
        easeFactor: 2.5,
        dueDate: "2026-10-14T00:00:00.000Z",
        mistakeCount: 0,
      },
    };

    await hydrateRepertoireProgress(null);
    writeLocalRepertoireProgress(progress);
    assert.deepEqual(readLocalRepertoireProgress(), progress);

    // When user-a signs in, trial progress is accessible and owned
    writeRepertoireProgressOwner("user-a");
    assert.equal(isRepertoireProgressOwnedBy("user-a"), true);
    assert.equal(isRepertoireProgressOwnedBy("user-b"), false);

    // Save with user-a sets owner
    await saveRepertoireProgress(progress, "user-a");
    assert.equal(storage.get(REPERTOIRE_PROGRESS_OWNER_KEY), "user-a");
  });
});
