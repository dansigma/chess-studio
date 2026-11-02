import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  AUTOSAVE_MAX_RETRY_DELAY_MS,
  AUTOSAVE_RETRY_DELAYS_MS,
  nextAutosaveRetryAt,
  pruneAutosaveRetries,
  resetAutosaveStateForTests,
  runDirtySavePass,
  type SavePassDeps,
} from "./studio-autosave.ts";
import { emptyBoard } from "../store/slices/board-helpers.ts";
import type { BoardSession } from "../store/slices/types.ts";

// SIG-1186 save-pass tests: the pass must not clear edits made while a save
// is in flight, and failed saves must retry with backoff. Drives the
// store-free pass with in-memory fakes; no network, no timers.
function seedBoard(id: string, overrides: Partial<BoardSession> = {}): BoardSession {
  return { ...emptyBoard(`Board ${id}`, id), ...overrides };
}

function makeHarness(initial: BoardSession[]) {
  let boards = initial.map((board) => ({ ...board }));
  const persisted: string[] = [];
  const marks: Array<{ id: string; remoteId: string }> = [];
  let errors = 0;
  const deps: SavePassDeps = {
    getBoards: () => boards,
    persist: async (board) => {
      persisted.push(board.id);
      return board.remoteId ?? `remote-${board.id}`;
    },
    markSaved: (id, remoteId) => {
      marks.push({ id, remoteId });
      boards = boards.map((board) =>
        board.id === id ? { ...board, remoteId, dirty: false } : board,
      );
    },
    onError: () => {
      errors += 1;
    },
  };
  return {
    deps,
    persisted,
    marks,
    errorCount: () => errors,
    getBoards: () => boards,
    setBoards: (next: BoardSession[]) => {
      boards = next;
    },
    editBoard: (id: string, updater: (board: BoardSession) => BoardSession) => {
      boards = boards.map((board) => (board.id === id ? updater(board) : board));
    },
  };
}

beforeEach(() => {
  resetAutosaveStateForTests();
});

describe("SIG-1186 runDirtySavePass", () => {
  it("saves a dirty board and marks it saved", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true })]);
    await runDirtySavePass(harness.deps);
    assert.deepEqual(harness.persisted, ["a"]);
    assert.deepEqual(harness.marks, [{ id: "a", remoteId: "remote-a" }]);
    assert.equal(harness.errorCount(), 0);
    assert.equal(nextAutosaveRetryAt(), null);
  });

  it("does not mark a board saved when a newer edit lands mid-save", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true })]);
    const live: { current: BoardSession[] } = { current: harness.getBoards() };
    harness.deps.getBoards = () => live.current;
    harness.deps.persist = async (board) => {
      // A move lands while the save is in flight: a new object with the new
      // content. The stale snapshot must not mark it clean — the pass loops
      // and persists the newer object instead.
      const newer = { ...board, dirty: true };
      live.current = [newer];
      const remoteId = `remote-${board.id}-2`;
      live.current = live.current.map((item) =>
        item.id === board.id ? { ...item, remoteId, dirty: false } : item,
      );
      return remoteId;
    };
    harness.deps.markSaved = (id, remoteId) => {
      live.current = live.current.map((item) =>
        item.id === id ? { ...item, remoteId, dirty: false } : item,
      );
    };
    await runDirtySavePass(harness.deps);
    const board = live.current.find((item) => item.id === "a");
    assert.equal(board?.dirty, false, "the catch-up persist carries the newer edit");
    assert.equal(board?.remoteId, "remote-a-2");
  });

  it("stays dirty when newer edits keep landing faster than the pass", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true })]);
    const live: { current: BoardSession[] } = { current: harness.getBoards() };
    harness.deps.getBoards = () => live.current;
    harness.deps.persist = async (board) => {
      // Every persist observes a still-newer object: the pass must stop after
      // the catch-up bound instead of looping forever, and the board must
      // stay dirty so the next pass sends the latest content.
      live.current = [{ ...board, dirty: true }];
      return `remote-${board.id}`;
    };
    let marks = 0;
    harness.deps.markSaved = () => {
      marks += 1;
    };
    await runDirtySavePass(harness.deps);
    assert.equal(marks, 0, "a perpetually-stale snapshot is never marked saved");
    assert.equal(
      live.current.find((item) => item.id === "a")?.dirty,
      true,
      "the board stays dirty for the next pass",
    );
  });

  it("clears only the saved board when several are dirty", async () => {
    const harness = makeHarness([
      seedBoard("a", { dirty: true }),
      seedBoard("b", { dirty: true }),
    ]);
    await runDirtySavePass(harness.deps);
    assert.deepEqual(harness.persisted, ["a", "b"]);
    assert.ok(
      harness.getBoards().every((board) => board.dirty === false),
      "every dirty board resolves independently",
    );
  });

  it("retries a failed save with backoff and notifies once per burst", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true })]);
    harness.deps.persist = async () => {
      throw new Error("offline");
    };
    const start = 1_000_000;
    await runDirtySavePass(harness.deps, start);
    assert.equal(harness.errorCount(), 1, "first failure notifies once");
    assert.equal(
      nextAutosaveRetryAt(),
      start + AUTOSAVE_RETRY_DELAYS_MS[0],
      "first retry waits 2 s",
    );

    // Retries before the deadline are skipped; the board stays dirty.
    await runDirtySavePass(harness.deps, start + 1000);
    assert.equal(harness.errorCount(), 1, "skipped retries do not re-notify");
    assert.equal(harness.getBoards()[0].dirty, true);

    // After the deadline the pass retries, fails again, and backs off to 5 s.
    await runDirtySavePass(harness.deps, start + AUTOSAVE_RETRY_DELAYS_MS[0]);
    assert.equal(harness.errorCount(), 1, "same burst still notifies once");
    assert.equal(
      nextAutosaveRetryAt(),
      start + AUTOSAVE_RETRY_DELAYS_MS[0] + AUTOSAVE_RETRY_DELAYS_MS[1],
    );

    // Success clears the retry state.
    harness.deps.persist = async (board) => `remote-${board.id}`;
    await runDirtySavePass(
      harness.deps,
      start + AUTOSAVE_RETRY_DELAYS_MS[0] + AUTOSAVE_RETRY_DELAYS_MS[1],
    );
    assert.equal(harness.getBoards()[0].dirty, false);
    assert.equal(nextAutosaveRetryAt(), null);
  });

  it("caps the backoff at 30 s and stops when the board is closed", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true })]);
    harness.deps.persist = async () => {
      throw new Error("offline");
    };
    let now = 0;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await runDirtySavePass(harness.deps, now);
      const next = nextAutosaveRetryAt();
      assert.ok(next !== null);
      now = next as number;
    }
    assert.equal(
      (nextAutosaveRetryAt() ?? 0) - now,
      0,
      "retries keep scheduling while the board stays dirty",
    );
    assert.ok(
      AUTOSAVE_MAX_RETRY_DELAY_MS === 30000,
      "backoff cap is 30 s by spec",
    );
    harness.setBoards([]);
    pruneAutosaveRetries(harness.getBoards());
    assert.equal(nextAutosaveRetryAt(), null, "closed boards stop retrying");
  });

  it("persists unmarks before marks like the old shell loop", async () => {
    const unmarked = seedBoard("unmarked", { dirty: true, repertoireColor: null });
    const marked = seedBoard("marked", { dirty: true, repertoireColor: "white" });
    const harness = makeHarness([marked, unmarked]);
    await runDirtySavePass(harness.deps);
    assert.deepEqual(
      harness.persisted,
      ["unmarked", "marked"],
      "unmarks sort first so the unique-slot handoff never overlaps",
    );
  });
});
