"use client";

import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { getMarksAt } from "@/src/chess/tree";
import { marksAreEmpty } from "@/src/chess/marks";
import { MenuDivider as Divider, MenuItem as Item } from "./ui/Menu";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";

// SIG-857: edit-menu subscriptions live here so MenuBar root stays static.
// Only primitives are subscribed; the marks-empty guard reads the active
// board once per render via selectActiveBoard (same value the panel already
// subscribes to), avoiding a second boards.find elsewhere.
// SIG-1109: factored into EditMenuItems so the mobile bottom sheet reuses the
// same actions; the exported component keeps the desktop menu contract.
export function EditMenuItems({ run }: { run: (action: () => void) => () => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
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
      <Item label={tStudioChrome(locale, "chrome.edit.undo")} shortcut="Ctrl+Z" onClick={run(undo)} />
      <Item label={tStudioChrome(locale, "chrome.edit.redo")} shortcut="Ctrl+Y" onClick={run(redo)} />
      <Divider />
      <Item label={tStudioChrome(locale, "chrome.edit.setupBoard")} onClick={run(() => useStudioStore.getState().setSetupMode(true))} />
      <Item label={tStudioChrome(locale, "chrome.edit.gameInfo")} onClick={run(() => setNotationEditor("headers"))} />
      <Divider />
      <Item label={tStudioChrome(locale, "chrome.edit.promote")} shortcut="Ctrl+↑" onClick={run(promoteVariation)} />
      <Item label={tStudioChrome(locale, "chrome.edit.makeMainline")} shortcut="Ctrl+Shift+↑" onClick={run(makeMainline)} />
      <Item label={tStudioChrome(locale, "chrome.edit.deleteVariation")} shortcut="Ctrl+Del" onClick={run(deleteVariation)} />
      <Item label={tStudioChrome(locale, "chrome.edit.deleteAfter")} shortcut="Del" onClick={run(pruneAfter)} />
      <Divider />
      <Item label={tStudioChrome(locale, "chrome.edit.textAfter")} shortcut="Ctrl+A" onClick={run(() => setNotationEditor("comment"))} />
      <Item
        label={tStudioChrome(locale, "chrome.edit.textBefore")}
        shortcut="Ctrl+Shift+A"
        disabled={activeAtStart}
        disabledReason={tStudioChrome(locale, "chrome.edit.reason.atStart")}
        onClick={run(() => setNotationEditor("commentBefore"))}
      />
      <Item
        label={tStudioChrome(locale, "chrome.edit.insertNull")}
        disabled={setupMode}
        disabledReason={tStudioChrome(locale, "chrome.edit.reason.inSetupMode")}
        onClick={run(insertNullMove)}
      />
      <Item
        label={tStudioChrome(locale, "chrome.edit.clearMarks")}
        disabled={marksEmpty}
        disabledReason={tStudioChrome(locale, "chrome.edit.reason.noMarks")}
        onClick={run(clearBoardMarks)}
      />
      <Divider />
      <Item label={tStudioChrome(locale, "chrome.edit.goStart")} shortcut="Home" onClick={run(toStart)} />
      <Item label={tStudioChrome(locale, "chrome.edit.goEnd")} shortcut="End" onClick={run(toEnd)} />
    </>
  );
}

export function MenuBarEditMenu({ run }: { run: (action: () => void) => () => void }) {
  return <EditMenuItems run={run} />;
}
