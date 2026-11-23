import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getNodeAt } from "../../chess/tree.ts";
import { emptyBoard } from "./board-helpers.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";
import { useStudioStore } from "../studio-store.ts";

const store = () => useStudioStore.getState();

function reset(): void {
  const board = emptyBoard("Board", "board-paste");
  useStudioStore.setState({
    boards: [board],
    activeBoardId: board.id,
    settings: { ...DEFAULT_SETTINGS },
    setupMode: false,
    training: false,
    statusMessage: null,
    boardHistories: new Map(),
  });
}

const sansOf = (path: number[]) => path.map((_, i) => getNodeAt(store().active().tree, path.slice(0, i + 1))!.san);

describe("SIG-1463 pasteMoves", () => {
  it("extends the line at the end and moves the cursor to its end", () => {
    reset();
    store().pasteMoves("1. e4 e5 2. Nf3");
    assert.deepEqual(sansOf(store().active().path), ["e4", "e5", "Nf3"]);
    assert.equal(store().active().tree.children.length, 1);
    assert.equal(store().statusMessage, "Pasted 3 moves.");
    store().pasteMoves("Nc6 Bb5");
    assert.deepEqual(sansOf(store().active().path), ["e4", "e5", "Nf3", "Nc6", "Bb5"]);
  });

  it("creates a variation mid-line", () => {
    reset();
    store().pasteMoves("e4 e5 Nf3");
    store().goPath([0]);
    store().pasteMoves("c5 Nf3");
    const tree = store().active().tree;
    assert.equal(tree.children[0].children.length, 2);
    assert.deepEqual(sansOf(store().active().path), ["e4", "c5", "Nf3"]);
  });

  it("reuses the existing continuation", () => {
    reset();
    store().pasteMoves("e4 e5 Nf3");
    store().goPath([]);
    store().pasteMoves("e4 e5 Nf3 Nc6");
    const tree = store().active().tree;
    assert.equal(tree.children.length, 1);
    assert.equal(tree.children[0].children[0].children[0].children.length, 1);
    assert.deepEqual(sansOf(store().active().path), ["e4", "e5", "Nf3", "Nc6"]);
  });

  it("is a single undo step", () => {
    reset();
    store().pasteMoves("e4 e5 Nf3 Nc6");
    store().undo();
    assert.equal(store().active().tree.children.length, 0);
    assert.deepEqual(store().active().path, []);
    store().redo();
    assert.equal(store().active().path.length, 4);
  });

  it("leaves the game alone and explains when nothing is legal", () => {
    reset();
    const before = store().active();
    store().pasteMoves("Nf6 e5");
    assert.equal(store().active(), before);
    assert.match(store().statusMessage ?? "", /no legal move/);
    store().pasteMoves('[Event "x"]\n\n1. e4 e5 *');
    assert.equal(store().active(), before);
    assert.match(store().statusMessage ?? "", /Open from clipboard/);
  });

  it("localizes the status message", () => {
    reset();
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });
    store().pasteMoves("zzz");
    assert.match(store().statusMessage ?? "", /Nada para colar/);
  });

  it("does nothing in training and setup modes", () => {
    reset();
    useStudioStore.setState({ setupMode: true });
    store().pasteMoves("e4");
    assert.equal(store().active().tree.children.length, 0);
    useStudioStore.setState({ setupMode: false, training: true });
    store().pasteMoves("e4");
    assert.equal(store().active().tree.children.length, 0);
  });
});
