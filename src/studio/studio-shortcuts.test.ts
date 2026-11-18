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
    newBoard: 0,
    print: 0,
    toggleLibrary: 0,
  };
  const deps: StudioShellShortcutDeps = {
    openFile: () => {
      calls.openFile += 1;
    },
    save: () => {
      calls.save += 1;
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
