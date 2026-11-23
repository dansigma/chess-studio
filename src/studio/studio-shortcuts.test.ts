// SIG-1398: StudioShell keyboard shortcut routing and modal/view guards.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { createEmptyTree, playMove } from "@/src/chess/tree.ts";
import type { BoardSession, WorkspaceView } from "@/src/store/slices/types.ts";
import type { StudioShellShortcutDeps } from "./studio-shortcuts.ts";

const { handleStudioShellKey } = await import("./studio-shortcuts.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");

const MOVE_E4 = { san: "e4", uci: "e2e4", fen: "fen-e4", from: "e2", to: "e4" };
const MOVE_E5 = { san: "e5", uci: "e7e5", fen: "fen-e5", from: "e7", to: "e5" };

function seedBoard(workspaceView: WorkspaceView = "studio"): void {
  let tree = createEmptyTree();
  let path: number[] = [];
  ({ tree, path } = playMove(tree, path, MOVE_E4));
  ({ tree } = playMove(tree, path, MOVE_E5));
  const board: BoardSession = {
    id: "board-shortcuts",
    remoteId: null,
    title: "Shortcuts",
    tree,
    path: [],
    headers: {},
    orientation: "white",
    repertoireColor: null,
    dirty: false,
    preview: false,
  };
  useStudioStore.setState({
    boards: [board],
    activeBoardId: board.id,
    workspaceView,
    setupMode: false,
    training: false,
    variationChoice: null,
  });
}

function makeDeps() {
  const calls = {
    openFile: 0,
    save: 0,
    saveAs: 0,
    newBoard: 0,
    print: 0,
    toggleLibrary: 0,
    pasteMoves: 0,
  };
  const deps: StudioShellShortcutDeps = {
    openFile: () => {
      calls.openFile += 1;
    },
    save: () => {
      calls.save += 1;
    },
    saveAs: () => {
      calls.saveAs += 1;
    },
    newBoard: () => {
      calls.newBoard += 1;
    },
    print: () => {
      calls.print += 1;
    },
    toggleLibrary: () => {
      calls.toggleLibrary += 1;
      useStudioStore.getState().toggleLibrary();
    },
    flip: () => useStudioStore.getState().flip(),
    back: () => useStudioStore.getState().back(),
    forward: () => useStudioStore.getState().forward(),
    pasteMoves: () => {
      calls.pasteMoves += 1;
    },
  };
  return { calls, deps };
}

function makeKeyEvent(
  key: string,
  init: Omit<KeyboardEventInit, "key"> = {},
): KeyboardEvent {
  return new window.KeyboardEvent("keydown", {
    key,
    cancelable: true,
    ...init,
  });
}

before(() => {
  setupDom();
});

after(async () => {
  await teardownDom();
});

beforeEach(() => {
  document.body.innerHTML = "";
  seedBoard("studio");
});

test("ArrowRight and f mutate active board in studio view", () => {
  const { deps } = makeDeps();
  const arrowRight = makeKeyEvent("ArrowRight");
  handleStudioShellKey(arrowRight, deps);
  assert.equal(arrowRight.defaultPrevented, true);
  assert.deepEqual(useStudioStore.getState().active().path, [0]);

  const flipKey = makeKeyEvent("f");
  handleStudioShellKey(flipKey, deps);
  assert.equal(flipKey.defaultPrevented, true);
  assert.equal(useStudioStore.getState().active().orientation, "black");
});

for (const view of ["library", "live"] as const) {
  test(`ArrowRight, ArrowLeft, Home, End, f, Ctrl+F, and Ctrl+P do not mutate or preventDefault in ${view} view`, () => {
    seedBoard(view);
    const { calls, deps } = makeDeps();

    for (const ev of [
      makeKeyEvent("ArrowRight"),
      makeKeyEvent("ArrowLeft"),
      makeKeyEvent("Home"),
      makeKeyEvent("End"),
      makeKeyEvent("f"),
      makeKeyEvent("f", { ctrlKey: true }),
      makeKeyEvent("p", { ctrlKey: true }),
      makeKeyEvent("Delete"),
    ]) {
      handleStudioShellKey(ev, deps);
      assert.equal(ev.defaultPrevented, false, `expected ${ev.key} not prevented in ${view}`);
    }

    assert.deepEqual(useStudioStore.getState().active().path, []);
    assert.equal(useStudioStore.getState().active().orientation, "white");
    assert.equal(calls.print, 0);
  });
}

test("Ctrl+Shift+L toggles library from library view and returns to studio", () => {
  seedBoard("library");
  const { calls, deps } = makeDeps();
  const ev = makeKeyEvent("L", { ctrlKey: true, shiftKey: true });
  handleStudioShellKey(ev, deps);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(calls.toggleLibrary, 1);
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("Ctrl+Shift+S and Cmd+Shift+S call saveAs only; Ctrl+S calls save only", () => {
  const { calls, deps } = makeDeps();

  const ctrlShiftS = makeKeyEvent("S", { ctrlKey: true, shiftKey: true });
  handleStudioShellKey(ctrlShiftS, deps);
  assert.equal(calls.saveAs, 1);
  assert.equal(calls.save, 0);
  assert.equal(ctrlShiftS.defaultPrevented, true);

  const cmdShiftS = makeKeyEvent("s", { metaKey: true, shiftKey: true });
  handleStudioShellKey(cmdShiftS, deps);
  assert.equal(calls.saveAs, 2);
  assert.equal(calls.save, 0);

  const ctrlS = makeKeyEvent("s", { ctrlKey: true });
  handleStudioShellKey(ctrlS, deps);
  assert.equal(calls.save, 1);
  assert.equal(calls.saveAs, 2);
  assert.equal(ctrlS.defaultPrevented, true);
});

test("global shortcuts (Ctrl+O, Ctrl+S, Ctrl+N) work in library and live without falling through", () => {
  for (const view of ["library", "live"] as const) {
    seedBoard(view);
    const { calls, deps } = makeDeps();

    const openEv = makeKeyEvent("o", { ctrlKey: true });
    handleStudioShellKey(openEv, deps);
    assert.equal(openEv.defaultPrevented, true);
    assert.equal(calls.openFile, 1);

    const saveEv = makeKeyEvent("s", { metaKey: true });
    handleStudioShellKey(saveEv, deps);
    assert.equal(saveEv.defaultPrevented, true);
    assert.equal(calls.save, 1);

    const newEv = makeKeyEvent("n", { ctrlKey: true });
    handleStudioShellKey(newEv, deps);
    assert.equal(newEv.defaultPrevented, true);
    assert.equal(calls.newBoard, 1);
  }
});

test("modal dialog blocks both board and global shortcuts", () => {
  const modal = document.createElement("div");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  document.body.appendChild(modal);

  const { calls, deps } = makeDeps();

  for (const ev of [
    makeKeyEvent("ArrowRight"),
    makeKeyEvent("f"),
    makeKeyEvent("f", { ctrlKey: true }),
    makeKeyEvent("p", { ctrlKey: true }),
    makeKeyEvent("o", { ctrlKey: true }),
    makeKeyEvent("s", { ctrlKey: true }),
    makeKeyEvent("n", { ctrlKey: true }),
    makeKeyEvent("l", { ctrlKey: true, shiftKey: true }),
  ]) {
    handleStudioShellKey(ev, deps);
    assert.equal(ev.defaultPrevented, false, `expected ${ev.key} blocked by modal`);
  }

  assert.deepEqual(useStudioStore.getState().active().path, []);
  assert.equal(useStudioStore.getState().active().orientation, "white");
  assert.equal(calls.openFile, 0);
  assert.equal(calls.save, 0);
  assert.equal(calls.newBoard, 0);
  assert.equal(calls.print, 0);
  assert.equal(calls.toggleLibrary, 0);
});

test("existing guards: editable target and [data-promotion-open] block shortcuts", () => {
  const input = document.createElement("input");
  document.body.appendChild(input);
  const { calls, deps } = makeDeps();

  const inputEv = makeKeyEvent("o", { ctrlKey: true });
  Object.defineProperty(inputEv, "target", { value: input });
  handleStudioShellKey(inputEv, deps);
  assert.equal(inputEv.defaultPrevented, false);
  assert.equal(calls.openFile, 0);

  const promo = document.createElement("div");
  promo.setAttribute("data-promotion-open", "");
  document.body.appendChild(promo);

  const promoEv = makeKeyEvent("ArrowRight");
  handleStudioShellKey(promoEv, deps);
  assert.equal(promoEv.defaultPrevented, false);
  assert.deepEqual(useStudioStore.getState().active().path, []);
});

test("Ctrl+Z undoes edits outside text fields and both redo chords reapply them", () => {
  const { deps } = makeDeps();
  const store = () => useStudioStore.getState();
  store().setMoveComment("test comment");

  for (const element of [document.createElement("input"), document.createElement("textarea")]) {
    const event = makeKeyEvent("z", { ctrlKey: true });
    Object.defineProperty(event, "target", { value: element });
    handleStudioShellKey(event, deps);
    assert.equal(event.defaultPrevented, false);
    assert.equal(store().active().tree.startComment, "test comment");
  }

  for (const redo of [makeKeyEvent("y", { ctrlKey: true }), makeKeyEvent("Z", { ctrlKey: true, shiftKey: true })]) {
    const undo = makeKeyEvent("z", { ctrlKey: true });
    handleStudioShellKey(undo, deps);
    assert.equal(undo.defaultPrevented, true);
    assert.equal(store().active().tree.startComment, undefined);

    handleStudioShellKey(redo, deps);
    assert.equal(redo.defaultPrevented, true);
    assert.equal(store().active().tree.startComment, "test comment");
  }
});

test("E requests an engine toggle and M leaves the variation (SIG-1459)", () => {
  const { deps } = makeDeps();
  const before = useStudioStore.getState().engineToggleRequest;
  const e = makeKeyEvent("e");
  handleStudioShellKey(e, deps);
  assert.equal(e.defaultPrevented, true);
  assert.equal(useStudioStore.getState().engineToggleRequest, before + 1);
  handleStudioShellKey(makeKeyEvent("e", { ctrlKey: true }), deps);
  handleStudioShellKey(makeKeyEvent("E", { shiftKey: true }), deps);
  assert.equal(useStudioStore.getState().engineToggleRequest, before + 1);

  // Main line: M does nothing.
  useStudioStore.getState().goPath([0, 0]);
  const mainM = makeKeyEvent("m");
  handleStudioShellKey(mainM, deps);
  assert.deepEqual(useStudioStore.getState().active().path, [0, 0]);

  // Variation 1.d4 off the start: M returns to 1.e4.
  const { tree, path } = (() => {
    const b = useStudioStore.getState().active();
    return playMove(b.tree, [], { san: "d4", uci: "d2d4", fen: "fen-d4", from: "d2", to: "d4" });
  })();
  useStudioStore.setState((s) => ({
    boards: s.boards.map((b) => ({ ...b, tree, path })),
  }));
  assert.deepEqual(useStudioStore.getState().active().path, [1]);
  handleStudioShellKey(makeKeyEvent("m"), deps);
  assert.deepEqual(useStudioStore.getState().active().path, [0]);
});

test("E and M ignore editable targets and dialogs (SIG-1459)", () => {
  const { deps } = makeDeps();
  const before = useStudioStore.getState().engineToggleRequest;
  const input = document.createElement("input");
  document.body.appendChild(input);
  const ev = makeKeyEvent("e");
  Object.defineProperty(ev, "target", { value: input });
  handleStudioShellKey(ev, deps);
  assert.equal(ev.defaultPrevented, false);
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  document.body.appendChild(dialog);
  handleStudioShellKey(makeKeyEvent("e"), deps);
  assert.equal(useStudioStore.getState().engineToggleRequest, before);
});

test("Ctrl+V pastes moves in studio view but keeps native paste in inputs", () => {
  const { calls, deps } = makeDeps();
  const ev = makeKeyEvent("v", { ctrlKey: true });
  handleStudioShellKey(ev, deps);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(calls.pasteMoves, 1);

  const input = document.createElement("input");
  document.body.appendChild(input);
  const inputEv = makeKeyEvent("v", { ctrlKey: true });
  Object.defineProperty(inputEv, "target", { value: input });
  handleStudioShellKey(inputEv, deps);
  assert.equal(inputEv.defaultPrevented, false);
  assert.equal(calls.pasteMoves, 1);
});
