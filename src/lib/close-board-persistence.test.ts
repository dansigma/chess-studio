import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { useStudioStore } from "../store/studio-store.ts";
import { emptyBoard } from "../store/slices/board-helpers.ts";
import type { BoardSession } from "../store/slices/types.ts";
import { persistBoardClose } from "./close-board-persistence.ts";
import { loadGuestBoards, saveGuestBoards } from "./guest-boards.ts";
import { loadSessionBoards } from "./session-boards.ts";

// SIG-1199: closing a board persists immediately (no debounce window in which
// a reload restores the closed board). Window stub installed after imports.
const storage = new Map<string, string>();

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

function seedBoard(id: string, overrides: Partial<BoardSession> = {}): BoardSession {
  return { ...emptyBoard(`Board ${id}`, id), ...overrides };
}

beforeEach(() => {
  storage.clear();
  useStudioStore.setState({
    boards: [seedBoard("a"), seedBoard("b"), seedBoard("c")],
    activeBoardId: "b",
    user: null,
  });
});

describe("SIG-1199 guest close", () => {
  it("closeBoard rewrites the guest snapshot synchronously", () => {
    saveGuestBoards(useStudioStore.getState().boards, "b");
    useStudioStore.getState().closeBoard("a");
    const loaded = loadGuestBoards();
    assert.ok(loaded);
    assert.deepEqual(loaded.boards.map((board) => board.id), ["b", "c"]);
    assert.equal(loaded.activeBoardId, "b", "the active board is kept");
  });

  it("closing the active board persists the neighbor as active", () => {
    useStudioStore.getState().closeBoard("b");
    const loaded = loadGuestBoards();
    assert.ok(loaded);
    assert.deepEqual(loaded.boards.map((board) => board.id), ["a", "c"]);
    assert.equal(loaded.activeBoardId, "a");
  });
});

describe("SIG-1199 signed-in close", () => {
  it("rewrites the user snapshot and marks the remote row closed, never deleting it", async () => {
    const calls: Array<[string | null, string | null]> = [];
    const boards = [seedBoard("a", { remoteId: "r-a" }), seedBoard("c", { remoteId: "r-c" })];
    persistBoardClose(
      { user: { id: "u1" }, boards, activeBoardId: "c" },
      seedBoard("b", { remoteId: "r-b" }),
      async (remoteId, userId) => {
        calls.push([remoteId, userId]);
      },
    );
    assert.deepEqual(calls, [["r-b", "u1"]]);
    const loaded = loadSessionBoards("u1");
    assert.ok(loaded);
    assert.deepEqual(loaded.boards.map((board) => board.id), ["a", "c"]);
    assert.equal(loaded.activeBoardId, "c");
    assert.equal(loadGuestBoards(), null, "accounts never touch the guest key");
  });

  it("does not call the remote for a session-only board and swallows remote failures", () => {
    const calls: string[] = [];
    persistBoardClose(
      { user: { id: "u1" }, boards: [seedBoard("a")], activeBoardId: "a" },
      seedBoard("b"),
      async (remoteId) => {
        calls.push(String(remoteId));
      },
    );
    assert.deepEqual(calls, []);
    assert.doesNotThrow(() =>
      persistBoardClose(
        { user: { id: "u1" }, boards: [seedBoard("a")], activeBoardId: "a" },
        seedBoard("b", { remoteId: "r-b" }),
        async () => {
          throw new Error("offline");
        },
      ),
    );
  });
});
