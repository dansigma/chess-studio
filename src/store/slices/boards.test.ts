import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyTree, playMove } from "../../chess/tree.ts";
import { useStudioStore } from "../studio-store.ts";
import { emptyBoard } from "./board-helpers.ts";
import type { BoardSession } from "./types.ts";

const MOVE_E4 = { san: "e4", uci: "e2e4", fen: "fen-e4", from: "e2", to: "e4" };
const MOVE_D4 = { san: "d4", uci: "d2d4", fen: "fen-d4", from: "d2", to: "d4" };
const MOVE_E5 = { san: "e5", uci: "e7e5", fen: "fen-e5", from: "e7", to: "e5" };

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

describe("SIG-1186 cursor navigation marks dirty", () => {
  it("marks the board dirty on back/forward/goPath/start/end/skip", () => {
    const clean = { ...emptyBoard("Nav", "board-nav"), dirty: false };
    useStudioStore.setState({ boards: [clean], activeBoardId: "board-nav" });
    const state = useStudioStore.getState();
    state.makeUciMove("e2", "e4");
    state.makeUciMove("e7", "e5");
    useStudioStore.getState().markSaved("board-nav", "remote-nav");

    useStudioStore.getState().back();
    assert.equal(useStudioStore.getState().active().dirty, true, "back() marks dirty");
    useStudioStore.getState().markSaved("board-nav", "remote-nav");

    useStudioStore.getState().forward();
    assert.equal(useStudioStore.getState().active().dirty, true, "forward() marks dirty");
    useStudioStore.getState().markSaved("board-nav", "remote-nav");

    const endPath = useStudioStore.getState().active().path;
    useStudioStore.getState().toStart();
    assert.equal(useStudioStore.getState().active().dirty, true, "toStart() marks dirty");
    useStudioStore.getState().markSaved("board-nav", "remote-nav");

    useStudioStore.getState().toEnd();
    assert.equal(useStudioStore.getState().active().dirty, true, "toEnd() marks dirty");
    useStudioStore.getState().markSaved("board-nav", "remote-nav");

    useStudioStore.getState().goPath(endPath.slice(0, 1));
    assert.equal(useStudioStore.getState().active().dirty, true, "goPath() marks dirty");
    useStudioStore.getState().markSaved("board-nav", "remote-nav");

    useStudioStore.getState().skipForward();
    assert.equal(useStudioStore.getState().active().dirty, true, "skipForward() marks dirty");
  });
});

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

// SIG-1187: Forward opens a continuation chooser at branching positions.
function seedBranchBoard(id = "board-branch"): BoardSession {
  let tree = createEmptyTree();
  let path: number[] = [];
  ({ tree, path } = playMove(tree, path, MOVE_E4));
  ({ tree } = playMove(tree, [], MOVE_D4));
  const board: BoardSession = {
    ...emptyBoard("Branch", id),
    tree,
    path: [],
  };
  void path;
  useStudioStore.setState({
    boards: [board],
    activeBoardId: board.id,
    variationChoice: null,
  });
  return board;
}

describe("SIG-1187 forward continuation chooser", () => {
  it("opens the choice without moving at 2+ children; a second forward() is a no-op", () => {
    seedBranchBoard();

    useStudioStore.getState().forward();

    let state = useStudioStore.getState();
    assert.deepEqual(state.active().path, []);
    assert.deepEqual(state.variationChoice, {
      boardId: "board-branch",
      path: [],
    });

    state.forward();
    state = useStudioStore.getState();
    assert.deepEqual(state.active().path, []);
    assert.deepEqual(state.variationChoice, {
      boardId: "board-branch",
      path: [],
    });
  });

  it("advances automatically with one child and no-ops with none", () => {
    // Linear board: e4 then e5 only, cursor at the root.
    let tree = createEmptyTree();
    let path: number[] = [];
    ({ tree, path } = playMove(tree, path, MOVE_E4));
    ({ tree } = playMove(tree, path, MOVE_E5));
    useStudioStore.setState({
      boards: [
        {
          ...emptyBoard("Linear", "board-linear"),
          tree,
          path: [],
        },
      ],
      activeBoardId: "board-linear",
      variationChoice: null,
    });

    useStudioStore.getState().forward();
    let state = useStudioStore.getState();
    assert.deepEqual(state.active().path, [0], "one child advances with no chooser");
    assert.equal(state.variationChoice, null);

    // Cursor at the leaf: forward is a no-op.
    useStudioStore.getState().forward();
    useStudioStore.getState().forward();
    state = useStudioStore.getState();
    assert.deepEqual(state.active().path, [0, 0]);
    assert.equal(state.variationChoice, null);
    state.forward();
    state = useStudioStore.getState();
    assert.deepEqual(state.active().path, [0, 0], "leaf forward is a no-op");
    assert.equal(state.variationChoice, null);
  });

  it("chooseVariation moves to the chosen child and clears the choice", () => {
    seedBranchBoard();
    useStudioStore.getState().forward();

    useStudioStore.getState().chooseVariation(1);

    const state = useStudioStore.getState();
    assert.deepEqual(state.active().path, [1]);
    assert.equal(state.variationChoice, null);
  });

  it("cancel leaves the path and clears the choice", () => {
    seedBranchBoard();
    useStudioStore.getState().forward();

    useStudioStore.getState().cancelVariationChoice();

    const state = useStudioStore.getState();
    assert.deepEqual(state.active().path, []);
    assert.equal(state.variationChoice, null);
  });

  it("clears a stale choice without moving on board/path mismatch or bad index", () => {
    seedBranchBoard();
    useStudioStore.getState().forward();

    // Simulate a mid-flight swap: cursor moved elsewhere, choice still set.
    useStudioStore.setState({
      boards: useStudioStore
        .getState()
        .boards.map((board) =>
          board.id === "board-branch" ? { ...board, path: [0] } : board,
        ),
    });
    useStudioStore.getState().chooseVariation(1);
    let state = useStudioStore.getState();
    assert.deepEqual(state.active().path, [0], "stale choice must not move");
    assert.equal(state.variationChoice, null);

    // Bad index clears without moving.
    useStudioStore.setState({ variationChoice: { boardId: "board-branch", path: [] } });
    useStudioStore.getState().chooseVariation(9);
    state = useStudioStore.getState();
    assert.deepEqual(state.active().path, [0]);
    assert.equal(state.variationChoice, null);
  });

  it("clears the choice on board switch, new/clone/close board, and goPath", () => {
    seedBranchBoard();
    const other = { ...emptyBoard("Other", "board-other"), dirty: false };
    useStudioStore.setState({
      boards: [useStudioStore.getState().active(), other],
      activeBoardId: "board-branch",
      variationChoice: { boardId: "board-branch", path: [] as number[] },
    });

    useStudioStore.getState().setActiveBoard("board-other");
    assert.equal(useStudioStore.getState().variationChoice, null);

    useStudioStore.setState({ variationChoice: { boardId: "board-other", path: [] } });
    useStudioStore.getState().goPath([]);
    assert.equal(useStudioStore.getState().variationChoice, null);

    useStudioStore.setState({ variationChoice: { boardId: "board-other", path: [] } });
    useStudioStore.getState().newBoard();
    assert.equal(useStudioStore.getState().variationChoice, null);

    useStudioStore.setState({ variationChoice: { boardId: "board-other", path: [] } });
    useStudioStore.getState().cloneBoard();
    assert.equal(useStudioStore.getState().variationChoice, null);

    useStudioStore.setState({ variationChoice: { boardId: "board-other", path: [] } });
    useStudioStore.getState().closeBoard();
    assert.equal(useStudioStore.getState().variationChoice, null);
  });
});
