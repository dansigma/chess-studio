import { leaveVariation } from "@/src/chess/tree";
import { useStudioStore } from "@/src/store/studio-store";

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  ) {
    return true;
  }
  return Boolean(target.closest('[role="dialog"]'));
}

export interface StudioShellShortcutDeps {
  openFile: () => void;
  save: () => void;
  saveAs: () => void;
  newBoard: () => void;
  print: () => void;
  toggleLibrary: () => void;
  flip: () => void;
  back: () => void;
  forward: () => void;
}

/**
 * Capture-phase keyboard handler for StudioShell.
 * Global bindings run in every workspace view; board-navigation and
 * tree-editing bindings only run in "studio", and modal dialogs block all.
 */
export function handleStudioShellKey(
  event: KeyboardEvent,
  deps: StudioShellShortcutDeps,
): void {
  if (isEditableTarget(event.target)) {
    return;
  }
  if (document.querySelector("[data-promotion-open]")) {
    return;
  }
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
    return;
  }

  const ctrl = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if (ctrl && key === "o") {
    event.preventDefault();
    deps.openFile();
    return;
  }
  if (ctrl && event.shiftKey && !event.altKey && key === "s") {
    event.preventDefault();
    deps.saveAs();
    return;
  }
  if (ctrl && !event.shiftKey && key === "s") {
    event.preventDefault();
    deps.save();
    return;
  }
  if (ctrl && event.shiftKey && !event.altKey && key === "l") {
    event.preventDefault();
    deps.toggleLibrary();
    return;
  }
  if (ctrl && key === "n") {
    event.preventDefault();
    deps.newBoard();
    return;
  }

  // SIG-1398: board-navigation and tree-editing shortcuts stay in Studio so
  // LibraryTable, LibraryPreview and LiveView keep Arrow/Home/End/f keys.
  if (useStudioStore.getState().workspaceView !== "studio") {
    return;
  }

  if (ctrl && key === "f") {
    event.preventDefault();
    deps.flip();
    return;
  }
  if (ctrl && key === "p") {
    event.preventDefault();
    deps.print();
    return;
  }

  const chromeFocus = !isEditableTarget(document.activeElement);
  if (chromeFocus && ctrl && !event.altKey && (key === "z" || (key === "y" && !event.shiftKey))) {
    event.preventDefault();
    const state = useStudioStore.getState();
    if (key === "z" && !event.shiftKey) {
      state.undo();
    } else {
      state.redo();
    }
    return;
  }
  // SIG-1192: bare F flips too (Lichess muscle memory). Ctrl+F stays for
  // ChessBase parity; this alias adds a key, it does not move one.
  if (!ctrl && !event.altKey && !event.shiftKey && key === "f" && chromeFocus) {
    event.preventDefault();
    deps.flip();
    return;
  }
  // SIG-1459: bare E starts/pauses the engine, bare M leaves the variation.
  if (!ctrl && !event.altKey && !event.shiftKey && key === "e" && chromeFocus) {
    event.preventDefault();
    useStudioStore.getState().requestEngineToggle();
    return;
  }
  if (!ctrl && !event.altKey && !event.shiftKey && key === "m" && chromeFocus) {
    event.preventDefault();
    const state = useStudioStore.getState();
    const target = leaveVariation(state.active().path);
    if (target) {
      state.goPath(target);
    }
    return;
  }
  if (ctrl && event.shiftKey && key === "a" && chromeFocus) {
    event.preventDefault();
    const state = useStudioStore.getState();
    if (state.active().path.length > 0) {
      state.setNotationEditor("commentBefore");
    }
    return;
  }
  if (ctrl && !event.shiftKey && key === "a" && chromeFocus) {
    event.preventDefault();
    useStudioStore.getState().setNotationEditor("comment");
    return;
  }
  if (ctrl && event.key === "Delete") {
    event.preventDefault();
    useStudioStore.getState().deleteVariation();
    return;
  }
  if (ctrl && event.shiftKey && event.key === "ArrowUp") {
    event.preventDefault();
    useStudioStore.getState().makeMainline();
    return;
  }
  if (ctrl && event.key === "ArrowUp") {
    event.preventDefault();
    useStudioStore.getState().promoteVariation();
    return;
  }
  if (event.key === "Delete") {
    event.preventDefault();
    useStudioStore.getState().pruneAfter();
    return;
  }
  if (event.key === "Home") {
    event.preventDefault();
    useStudioStore.getState().toStart();
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    useStudioStore.getState().toEnd();
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    deps.back();
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    deps.forward();
  }
}
