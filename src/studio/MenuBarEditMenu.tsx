"use client";

import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { getMarksAt } from "@/src/chess/tree";
import { marksAreEmpty } from "@/src/chess/marks";
import { MenuDivider as Divider, MenuItem as Item } from "./ui/Menu";

// SIG-857: edit-menu subscriptions live here so MenuBar root stays static.
// Only primitives are subscribed; the marks-empty guard reads the active
// board once per render via selectActiveBoard (same value the panel already
// subscribes to), avoiding a second boards.find elsewhere.
export function MenuBarEditMenu({ run }: { run: (action: () => void) => () => void }) {
  const setNotationEditor = useStudioStore((state) => state.setNotationEditor);
  const setupMode = useStudioStore((state) => state.setupMode);
  const undo = useStudioStore((state) => state.undo);
  const redo = useStudioStore((state) => state.redo);
  const pruneAfter = useStudioStore((state) => state.pruneAfter);
  const promoteVariation = useStudioStore((state) => state.promoteVariation);
  const makeMainline = useStudioStore((state) => state.makeMainline);
  const deleteVariation = useStudioStore((state) => state.deleteVariation);
  const insertNullMove = useStudioStore((state) => state.insertNullMove);
  const clearBoardMarks = useStudioStore((state) => state.clearBoardMarks);
  const toStart = useStudioStore((state) => state.toStart);
  const toEnd = useStudioStore((state) => state.toEnd);
  const activeAtStart = useStudioStore((state) => selectActiveBoard(state).path.length === 0);
  const marksEmpty = useStudioStore((state) => {
    const active = selectActiveBoard(state);
    return marksAreEmpty(getMarksAt(active.tree, active.path));
  });

  return (
    <>
      <Item label="Undo" shortcut="Ctrl+Z" onClick={run(undo)} />
      <Item label="Redo" shortcut="Ctrl+Y" onClick={run(redo)} />
      <Divider />
      <Item label="Setup board" onClick={run(() => useStudioStore.getState().setSetupMode(true))} />
      <Item label="Game information" onClick={run(() => setNotationEditor("headers"))} />
      <Divider />
      <Item label="Promote variation" shortcut="Ctrl+↑" onClick={run(promoteVariation)} />
      <Item label="Make mainline" shortcut="Ctrl+Shift+↑" onClick={run(makeMainline)} />
      <Item label="Delete variation" shortcut="Ctrl+Del" onClick={run(deleteVariation)} />
      <Item label="Delete after" shortcut="Del" onClick={run(pruneAfter)} />
      <Divider />
      <Item label="Text after move" shortcut="Ctrl+A" onClick={run(() => setNotationEditor("comment"))} />
      <Item
        label="Text before move"
        shortcut="Ctrl+Shift+A"
        disabled={activeAtStart}
        disabledReason="At start"
        onClick={run(() => setNotationEditor("commentBefore"))}
      />
      <Item
        label="Insert null move"
        disabled={setupMode}
        disabledReason="In setup mode"
        onClick={run(insertNullMove)}
      />
      <Item
        label="Clear arrows & highlights"
        disabled={marksEmpty}
        disabledReason="No marks"
        onClick={run(clearBoardMarks)}
      />
      <Divider />
      <Item label="Go to start" shortcut="Home" onClick={run(toStart)} />
      <Item label="Go to end" shortcut="End" onClick={run(toEnd)} />
    </>
  );
}
