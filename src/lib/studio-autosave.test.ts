import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  AUTOSAVE_MAX_RETRY_DELAY_MS,
  AUTOSAVE_RETRY_DELAYS_MS,
  nextAutosaveRetryAt,
  pruneAutosaveRetries,
  resetAutosaveStateForTests,
  runDirtySavePass,
  saveBoardNow,
  subscribeAutosaveRetries,
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

describe("SIG-1414 saveBoardNow (menu Save and Ctrl+S)", () => {
  it("persists the newer edit made during the round-trip instead of marking the stale snapshot saved", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true })]);
    const sent: string[] = [];
    let edited = false;
    harness.deps.persist = async (board) => {
      sent.push(board.title);
      if (!edited) {
        edited = true;
        harness.editBoard("a", (item) => ({ ...item, title: "after edit", dirty: true }));
      }
      return "remote-a";
    };
    assert.equal(await saveBoardNow("a", harness.deps), "saved");
    assert.deepEqual(sent, ["Board a", "after edit"]);
    const board = harness.getBoards()[0]!;
    assert.equal(board.title, "after edit");
    assert.equal(board.dirty, false);
  });

  it("waits for an autosave already saving a new board, so the board is inserted once", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true, remoteId: null })]);
    let inserts = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    harness.deps.persist = async (board) => {
      if (!board.remoteId) {
        inserts += 1;
        await gate;
        return "remote-a";
      }
      return board.remoteId;
    };
    const autosave = runDirtySavePass(harness.deps);
    const manual = saveBoardNow("a", harness.deps);
    release();
    await autosave;
    assert.equal(await manual, "saved");
    assert.equal(inserts, 1, "the manual save updates the row the autosave inserted");
    assert.equal(harness.getBoards()[0]!.remoteId, "remote-a");
  });

  it("saves a clean board once and reports a failure into the retry backoff", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: false })]);
    assert.equal(await saveBoardNow("a", harness.deps), "saved");
    assert.deepEqual(harness.persisted, ["a"]);

    harness.deps.persist = async () => {
      throw new Error("network");
    };
    harness.editBoard("a", (item) => ({ ...item, dirty: true }));
    assert.equal(await saveBoardNow("a", harness.deps), "failed");
    assert.notEqual(nextAutosaveRetryAt(), null);
    assert.equal(harness.getBoards()[0]!.dirty, true);
  });

  it("reports declined when persist returns no id (signed out)", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true })]);
    harness.deps.persist = async () => null;
    assert.equal(await saveBoardNow("a", harness.deps), "declined");
    assert.equal(harness.getBoards()[0]!.dirty, true);
  });
});

describe("SIG-1414 a new board is inserted once even when edits land during its insert", () => {
  function insertCounter(harness: ReturnType<typeof makeHarness>, onPersist: () => void) {
    const inserts: string[] = [];
    harness.deps.persist = async (board) => {
      onPersist();
      if (board.remoteId) {
        return board.remoteId;
      }
      const id = `row-${inserts.length + 1}`;
      inserts.push(id);
      return id;
    };
    return inserts;
  }

  it("the catch-up persist updates the inserted row (explicit Save)", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true, remoteId: null })]);
    let edits = 0;
    const inserts = insertCounter(harness, () => {
      if (edits === 0) {
        edits += 1;
        harness.editBoard("a", (item) => ({ ...item, title: "edited", dirty: true }));
      }
    });
    assert.equal(await saveBoardNow("a", harness.deps), "saved");
    assert.deepEqual(inserts, ["row-1"]);
    assert.equal(harness.getBoards()[0]!.remoteId, "row-1");
  });

  it("a later autosave pass reuses the row after the catch-up bound defers the board", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true, remoteId: null })]);
    let editing = true;
    const inserts = insertCounter(harness, () => {
      if (editing) {
        harness.editBoard("a", (item) => ({ ...item, dirty: true }));
      }
    });
    await runDirtySavePass(harness.deps);
    assert.equal(harness.getBoards()[0]!.dirty, true, "deferred: edits kept landing");
    editing = false;
    await runDirtySavePass(harness.deps);
    assert.deepEqual(inserts, ["row-1"]);
    assert.equal(harness.getBoards()[0]!.remoteId, "row-1");
    assert.equal(harness.getBoards()[0]!.dirty, false);
  });
});

describe("SIG-1414 retry listeners", () => {
  it("are told about a failed explicit Save so the shell can arm the retry wakeup", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true })]);
    harness.deps.persist = async () => {
      throw new Error("network");
    };
    let notified = 0;
    const unsubscribe = subscribeAutosaveRetries(() => {
      notified += 1;
    });
    assert.equal(await saveBoardNow("a", harness.deps), "failed");
    assert.equal(notified, 1);
    unsubscribe();
    await saveBoardNow("a", harness.deps);
    assert.equal(notified, 1, "no calls after unsubscribe");
  });
});

describe("SIG-1414 retries only for boards the autosave pass will retry", () => {
  it("a failed explicit Save of a clean board records no retry deadline", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: false }), seedBoard("p", { dirty: true, preview: true })]);
    harness.deps.persist = async () => {
      throw new Error("offline");
    };
    let notified = 0;
    subscribeAutosaveRetries(() => {
      notified += 1;
    });
    assert.equal(await saveBoardNow("a", harness.deps), "failed");
    assert.equal(await saveBoardNow("p", harness.deps), "failed");
    assert.equal(nextAutosaveRetryAt(), null, "nothing for the pass to consume");
    assert.equal(notified, 0);
  });

  it("pruning drops a retry once its board is clean, so no past deadline lingers", async () => {
    const harness = makeHarness([seedBoard("a", { dirty: true })]);
    harness.deps.persist = async () => {
      throw new Error("offline");
    };
    await runDirtySavePass(harness.deps, 0);
    assert.notEqual(nextAutosaveRetryAt(), null);
    harness.editBoard("a", (item) => ({ ...item, dirty: false }));
    pruneAutosaveRetries(harness.getBoards());
    assert.equal(nextAutosaveRetryAt(), null);
  });
});
