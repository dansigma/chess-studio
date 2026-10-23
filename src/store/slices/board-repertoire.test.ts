import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { useStudioStore } from "../studio-store.ts";
import { selectRepertoireBoard } from "./selectors.ts";
import { emptyBoard } from "./board-helpers.ts";

// SIG-1092: one board per color holds the repertoire mark. These tests pin
// the store semantics through the real store: setBoardRepertoire moves the
// mark (clearing the previous holder and marking both dirty) and
// selectRepertoireBoard resolves the holder or null. node --test runs each
// file in its own process, so no store stub leaks into other suites.
function seedTwoBoards(): void {
  const a = { ...emptyBoard("A", "board-a"), dirty: false };
  const b = { ...emptyBoard("B", "board-b"), dirty: false };
  useStudioStore.setState({ boards: [a, b], activeBoardId: "board-a" });
}

describe("SIG-1092 repertoire mark", () => {
  it("marking a second board as White repertoire clears the first", () => {
    seedTwoBoards();
    const store = () => useStudioStore.getState();

    store().setBoardRepertoire("board-a", "white");
    assert.equal(store().boards.find((b) => b.id === "board-a")?.repertoireColor, "white");

    store().setBoardRepertoire("board-b", "white");
    const state = store();
    assert.equal(state.boards.find((b) => b.id === "board-a")?.repertoireColor, null);
    assert.equal(state.boards.find((b) => b.id === "board-b")?.repertoireColor, "white");
    assert.equal(state.boards.find((b) => b.id === "board-a")?.dirty, true);
    assert.equal(state.boards.find((b) => b.id === "board-b")?.dirty, true);
  });

  it("marks for White and Black coexist on different boards", () => {
    seedTwoBoards();
    const store = () => useStudioStore.getState();

    store().setBoardRepertoire("board-a", "white");
    store().setBoardRepertoire("board-b", "black");

    const state = store();
    assert.equal(selectRepertoireBoard(state, "white")?.id, "board-a");
    assert.equal(selectRepertoireBoard(state, "black")?.id, "board-b");
  });

  it("clearing a mark resolves the selector to null", () => {
    seedTwoBoards();
    const store = () => useStudioStore.getState();

    store().setBoardRepertoire("board-a", "white");
    assert.equal(selectRepertoireBoard(store(), "white")?.id, "board-a");

    store().setBoardRepertoire("board-a", null);
    assert.equal(selectRepertoireBoard(store(), "white"), null);
    assert.equal(selectRepertoireBoard(store(), "black"), null);
  });

  it("a clone never inherits the repertoire mark", () => {
    seedTwoBoards();
    const store = () => useStudioStore.getState();

    store().setBoardRepertoire("board-a", "white");
    store().cloneBoard();

    const state = store();
    assert.equal(selectRepertoireBoard(state, "white")?.id, "board-a");
    assert.equal(state.boards.filter((b) => b.repertoireColor === "white").length, 1);
  });
});
