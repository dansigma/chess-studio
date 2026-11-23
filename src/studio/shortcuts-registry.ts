// SIG-1383: static registry of the Studio's keyboard shortcuts and pointer
// gestures, rendered by ShortcutsDialog (Help → "Shortcuts and gestures").
// Every entry mirrors a real binding: the global keydown handler in
// StudioShell.tsx, the toolbar buttons in NotationToolbar.tsx (same bindings),
// and the touch/mouse gestures in BoardPanel.tsx / MobileMoveStrip.tsx.
// Key labels match the shortcut hints the menus already show ("Ctrl", "Del",
// "←") and stay untranslated, same as the menu `shortcut` props.
import type { StudioChromeStringKey } from "@/src/i18n/studio-chrome-strings";

export const SHORTCUT_GROUP_ORDER = ["navigation", "editing", "board", "panels"] as const;
export type ShortcutGroup = (typeof SHORTCUT_GROUP_ORDER)[number];

export type ShortcutEntry = {
  group: ShortcutGroup;
  /** i18n key for the action the shortcut or gesture triggers. */
  action: StudioChromeStringKey;
  /** Alternative chords; each chord is an ordered list of key labels. */
  chords?: readonly (readonly string[])[];
  /** i18n key for a pointer/touch gesture, rendered instead of key caps. */
  gesture?: StudioChromeStringKey;
};

export const SHORTCUT_ENTRIES: readonly ShortcutEntry[] = [
  // Navigation — StudioShell `onKey` (Home/End/ArrowLeft/ArrowRight) plus the
  // board swipe in BoardPanel (`swipeDirection`: left = forward, right = back).
  { group: "navigation", action: "chrome.edit.goStart", chords: [["Home"]] },
  { group: "navigation", action: "chrome.edit.goEnd", chords: [["End"]] },
  { group: "navigation", action: "chrome.moves.previous", chords: [["←"]] },
  { group: "navigation", action: "chrome.moves.next", chords: [["→"]] },
  { group: "navigation", action: "chrome.moves.next", gesture: "chrome.shortcuts.gesture.swipeLeft" },
  { group: "navigation", action: "chrome.moves.previous", gesture: "chrome.shortcuts.gesture.swipeRight" },
  // Editing — StudioShell `onKey` + the Edit menu / NotationToolbar bindings.
  { group: "editing", action: "chrome.edit.undo", chords: [["Ctrl", "Z"]] },
  { group: "editing", action: "chrome.edit.redo", chords: [["Ctrl", "Y"], ["Ctrl", "Shift", "Z"]] },
  { group: "editing", action: "chrome.file.pasteMoves", chords: [["Ctrl", "V"]] },
  { group: "editing", action: "chrome.edit.textAfter", chords: [["Ctrl", "A"]] },
  { group: "editing", action: "chrome.edit.textBefore", chords: [["Ctrl", "Shift", "A"]] },
  { group: "editing", action: "chrome.edit.promote", chords: [["Ctrl", "↑"]] },
  { group: "editing", action: "chrome.edit.makeMainline", chords: [["Ctrl", "Shift", "↑"]] },
  { group: "editing", action: "chrome.edit.deleteVariation", chords: [["Ctrl", "Del"]] },
  { group: "editing", action: "chrome.edit.deleteAfter", chords: [["Del"]] },
  // SIG-1459: bare E / M in StudioShell `onKey`.
  { group: "navigation", action: "chrome.shortcuts.action.leaveVariation", chords: [["M"]] },
  { group: "panels", action: "chrome.shortcuts.action.toggleEngine", chords: [["E"]] },
  // Board — StudioShell `onKey` file/view bindings; F is the bare-key alias of
  // Ctrl+F (SIG-1192). Right-click / long-press opens BoardContextMenu.
  { group: "board", action: "chrome.view.flip", chords: [["Ctrl", "F"], ["F"]] },
  { group: "board", action: "chrome.file.save", chords: [["Ctrl", "S"]] },
  { group: "board", action: "chrome.file.saveAs", chords: [["Ctrl", "Shift", "S"]] },
  { group: "board", action: "chrome.file.openPgn", chords: [["Ctrl", "O"]] },
  { group: "board", action: "chrome.file.newBoard", chords: [["Ctrl", "N"]] },
  { group: "board", action: "chrome.file.print", chords: [["Ctrl", "P"]] },
  { group: "board", action: "chrome.view.library", chords: [["Ctrl", "Shift", "L"]] },
  { group: "board", action: "chrome.shortcuts.action.boardMenu", gesture: "chrome.shortcuts.gesture.boardMenu" },
  // Panels — right-click on a move (NotationMoves) / long-press on a strip
  // move (MobileMoveStrip) opens the NotationContextMenu.
  { group: "panels", action: "chrome.shortcuts.action.moveMenu", gesture: "chrome.shortcuts.gesture.moveMenu" },
];
