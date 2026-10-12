import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { useStudioStore } from "../studio-store.ts";
import { emptyBoard } from "./board-helpers.ts";

// Regression coverage for SIG-916: the debounced auto-save in StudioShell
// persists every board with dirty: true, not just the active board. These
// tests pin the store-level semantics the fixed handler relies on — the dirty
// selection never depends on active(), and markSaved resolves boards
// independently by id. node --test runs each file in its own process, so no
// store stub can leak into other suites.
function seedBoards(options: { aDirty: boolean; bDirty: boolean; activeId: string }): void {
  const a = { ...emptyBoard("A", "board-a"), dirty: options.aDirty };
  const b = { ...emptyBoard("B", "board-b"), dirty: options.bDirty };
  useStudioStore.setState({ boards: [a, b], activeBoardId: options.activeId });
}

describe("SIG-916 multi-dirty auto-save", () => {
  it("resolves every dirty board independently of the active board", () => {
    seedBoards({ aDirty: true, bDirty: true, activeId: "board-b" });

    const state = useStudioStore.getState();
    assert.deepEqual(
      state.boards.filter((b) => b.dirty).map((b) => b.id),
      ["board-a", "board-b"],
    );

    state.markSaved("board-a", "remote-a");
    state.markSaved("board-b", "remote-b");

    const next = useStudioStore.getState();
    assert.deepEqual(
      next.boards.map((b) => ({ id: b.id, dirty: b.dirty, remoteId: b.remoteId })),
      [
        { id: "board-a", dirty: false, remoteId: "remote-a" },
        { id: "board-b", dirty: false, remoteId: "remote-b" },
      ],
    );
  });

  it("keeps the non-active dirty board visible after a tab switch (the exact bug)", () => {
    // Edit Board A, switch to Board B before the debounce fires: the old
    // active()-only handler saved B (clean, a no-op) and stranded A dirty.
    seedBoards({ aDirty: true, bDirty: false, activeId: "board-a" });
    useStudioStore.getState().setActiveBoard("board-b");

    const state = useStudioStore.getState();
    assert.equal(state.active().id, "board-b");
    assert.deepEqual(
      state.boards.filter((b) => b.dirty).map((b) => b.id),
      ["board-a"],
      "switching tabs must not hide the still-dirty board from the auto-save selection",
    );
  });

  it("markSaved on one board leaves the other board dirty", () => {
    seedBoards({ aDirty: true, bDirty: true, activeId: "board-b" });

    useStudioStore.getState().markSaved("board-b", "remote-b");

    const state = useStudioStore.getState();
    const a = state.boards.find((b) => b.id === "board-a");
    const b = state.boards.find((b) => b.id === "board-b");
    assert.equal(a?.dirty, true, "saving B must not clear A");
    assert.equal(b?.dirty, false);
    assert.equal(b?.remoteId, "remote-b");
  });

  it("surfaces per-board save failures through the status message", () => {
    // Covers the error path the auto-save loop uses; the Supabase failure
    // itself cannot be triggered without credentials.
    useStudioStore.getState().setStatus("Could not save board.");
    assert.equal(useStudioStore.getState().statusMessage, "Could not save board.");
    useStudioStore.getState().setStatus(null);
    assert.equal(useStudioStore.getState().statusMessage, null);
  });
});
