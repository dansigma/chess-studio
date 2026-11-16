// SIG-1384: the Desfazer toast for destructive cuts — label per locale, the
// 5s window, Escape dismissal and the undo button restoring the line.
import assert from "node:assert/strict";
import { after, afterEach, before, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { emptyBoard } from "@/src/store/slices/board-helpers";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings";
import { useStudioStore } from "@/src/store/studio-store";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { getNodeAt } from "@/src/chess/tree";
import { CUT_UNDO_MS, CutUndoToast } from "./CutUndoToast";

before(() => setupDom());
afterEach(() => {
  cleanup();
  mock.timers.reset();
});
after(() => teardownDom());

/** Puts the store on a board whose e4 cut away the e5/Nf3 continuation. */
function seedCut(locale: SiteLocale): void {
  const board = emptyBoard("Cut toast", "board-cut-toast");
  useStudioStore.setState({
    boards: [board],
    activeBoardId: board.id,
    settings: { ...DEFAULT_SETTINGS, locale },
    pendingCutUndo: null,
  });
  const store = () => useStudioStore.getState();
  store().openListedGame({
    title: "Cut toast",
    moves: "e4 e5 Nf3",
    openInNewBoard: true,
  });
  store().goPath([0]);
  store().pruneAfter();
  assert.ok(store().pendingCutUndo, "seed: the cut left an undo entry");
}

test("the toast names Desfazer in PT and Undo in EN, and undoes the cut", () => {
  seedCut("pt-br");
  render(<CutUndoToast />);

  assert.ok(screen.getByText("Lances removidos"));
  assert.ok(screen.getByRole("button", { name: "Desfazer" }));

  fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));

  const board = useStudioStore.getState().active();
  assert.equal(getNodeAt(board.tree, [0])?.children.length, 1, "the cut line is back");
  assert.equal(useStudioStore.getState().pendingCutUndo, null);

  cleanup();
  seedCut("en");
  render(<CutUndoToast />);
  assert.ok(screen.getByRole("button", { name: "Undo" }));
});

test("the toast dismisses itself after five seconds", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  seedCut("pt-br");
  render(<CutUndoToast />);

  act(() => {
    mock.timers.tick(CUT_UNDO_MS - 1);
  });
  assert.ok(screen.getByRole("button", { name: "Desfazer" }), "still offered just before 5s");

  act(() => {
    mock.timers.tick(1);
  });
  assert.equal(screen.queryByRole("button", { name: "Desfazer" }), null, "gone at 5s");
  assert.equal(useStudioStore.getState().pendingCutUndo, null);
});

test("Escape dismisses the toast without restoring anything", () => {
  seedCut("pt-br");
  render(<CutUndoToast />);
  const cutTree = useStudioStore.getState().active().tree;

  act(() => {
    fireEvent.keyDown(window, { key: "Escape" });
  });

  assert.equal(useStudioStore.getState().pendingCutUndo, null);
  assert.equal(useStudioStore.getState().active().tree, cutTree, "dismiss is not undo");
  assert.equal(screen.queryByRole("button", { name: "Desfazer" }), null);
});

test("a newer edit hides the toast before its timer fires", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  seedCut("pt-br");
  render(<CutUndoToast />);

  act(() => {
    useStudioStore.getState().setMoveComment("later");
  });

  assert.equal(screen.queryByRole("button", { name: "Desfazer" }), null);
  assert.equal(useStudioStore.getState().pendingCutUndo, null);
});
