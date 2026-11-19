// SIG-1383: the shortcuts registry must mirror the real handlers — every
// StudioShell global binding and toolbar binding appears exactly once, every
// i18n key exists in both locales, and no entry is duplicated.
import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDIO_CHROME_STRING_KEYS,
  TABLES,
  tStudioChrome,
  type StudioChromeStringKey,
} from "@/src/i18n/studio-chrome-strings.ts";
import {
  SHORTCUT_ENTRIES,
  SHORTCUT_GROUP_ORDER,
  type ShortcutEntry,
} from "./shortcuts-registry.ts";

const KEY_SET = new Set<string>(STUDIO_CHROME_STRING_KEYS);

function chordLabel(chord: readonly string[]): string {
  return chord.join("+");
}

function entrySignature(entry: ShortcutEntry): string {
  return [
    entry.group,
    entry.action,
    entry.chords ? entry.chords.map(chordLabel).join("/") : "",
    entry.gesture ?? "",
  ].join("|");
}

test("registry entries are unique and well-formed", () => {
  const seen = new Set<string>();
  for (const entry of SHORTCUT_ENTRIES) {
    const signature = entrySignature(entry);
    assert.ok(!seen.has(signature), `duplicate registry entry: ${signature}`);
    seen.add(signature);
    assert.ok(
      (SHORTCUT_GROUP_ORDER as readonly string[]).includes(entry.group),
      `unknown group: ${entry.group}`,
    );
    assert.ok(KEY_SET.has(entry.action), `unknown action key: ${entry.action}`);
    assert.ok(
      Boolean(entry.chords) !== Boolean(entry.gesture),
      `entry must have exactly one of chords/gesture: ${signature}`,
    );
    if (entry.chords) {
      assert.ok(entry.chords.length > 0, `entry has empty chords: ${signature}`);
      for (const chord of entry.chords) {
        assert.ok(chord.length > 0, `entry has an empty chord: ${signature}`);
      }
    }
    if (entry.gesture) {
      assert.ok(KEY_SET.has(entry.gesture), `unknown gesture key: ${entry.gesture}`);
    }
  }
});

test("every registry i18n key renders non-empty in EN and PT-BR", () => {
  for (const entry of SHORTCUT_ENTRIES) {
    for (const key of [entry.action, entry.gesture].filter(Boolean) as StudioChromeStringKey[]) {
      assert.ok(tStudioChrome("en", key).length > 0, `en:${key} must not be empty`);
      assert.ok(tStudioChrome("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
      assert.ok(TABLES.en[key].length > 0 && TABLES["pt-br"][key].length > 0);
    }
  }
});

// The global keydown handler in StudioShell.tsx binds exactly these chords;
// the NotationToolbar buttons trigger the same store actions, so each binding
// must appear exactly once here.
const EXPECTED_BINDINGS: ReadonlyArray<{ action: StudioChromeStringKey; chord: string }> = [
  { action: "chrome.edit.goStart", chord: "Home" },
  { action: "chrome.edit.goEnd", chord: "End" },
  { action: "chrome.moves.previous", chord: "←" },
  { action: "chrome.moves.next", chord: "→" },
  { action: "chrome.edit.textAfter", chord: "Ctrl+A" },
  { action: "chrome.edit.textBefore", chord: "Ctrl+Shift+A" },
  { action: "chrome.edit.promote", chord: "Ctrl+↑" },
  { action: "chrome.edit.makeMainline", chord: "Ctrl+Shift+↑" },
  { action: "chrome.edit.deleteVariation", chord: "Ctrl+Del" },
  { action: "chrome.edit.deleteAfter", chord: "Del" },
  { action: "chrome.view.flip", chord: "Ctrl+F" },
  { action: "chrome.view.flip", chord: "F" },
  { action: "chrome.file.save", chord: "Ctrl+S" },
  { action: "chrome.file.saveAs", chord: "Ctrl+Shift+S" },
  { action: "chrome.file.openPgn", chord: "Ctrl+O" },
  { action: "chrome.file.newBoard", chord: "Ctrl+N" },
  { action: "chrome.file.print", chord: "Ctrl+P" },
  { action: "chrome.view.library", chord: "Ctrl+Shift+L" },
];

test("registry covers every StudioShell/NotationToolbar binding exactly once", () => {
  for (const { action, chord } of EXPECTED_BINDINGS) {
    const matches = SHORTCUT_ENTRIES.filter(
      (entry) =>
        entry.action === action &&
        entry.chords?.some((candidate) => chordLabel(candidate) === chord),
    );
    assert.equal(matches.length, 1, `${action} ${chord} must appear exactly once`);
  }
  // And nothing extra on the keyboard side: the chords are exactly the
  // expected bindings (gestures are the only non-key entries; flip lists its
  // two chords — Ctrl+F and F — on a single entry).
  const chordCount = SHORTCUT_ENTRIES.reduce((count, entry) => count + (entry.chords?.length ?? 0), 0);
  assert.equal(chordCount, EXPECTED_BINDINGS.length);
});

test("hidden gestures are documented: board/move menus and board swipe", () => {
  const gestures = SHORTCUT_ENTRIES.filter((entry) => entry.gesture);
  const gestureKeys = gestures.map((entry) => entry.gesture);
  assert.ok(gestureKeys.includes("chrome.shortcuts.gesture.boardMenu"));
  assert.ok(gestureKeys.includes("chrome.shortcuts.gesture.moveMenu"));
  assert.ok(gestureKeys.includes("chrome.shortcuts.gesture.swipeLeft"));
  assert.ok(gestureKeys.includes("chrome.shortcuts.gesture.swipeRight"));
  // Swipe left = forward, swipe right = back (BoardPanel swipeDirection).
  const swipeLeft = gestures.find((entry) => entry.gesture === "chrome.shortcuts.gesture.swipeLeft");
  const swipeRight = gestures.find((entry) => entry.gesture === "chrome.shortcuts.gesture.swipeRight");
  assert.equal(swipeLeft?.action, "chrome.moves.next");
  assert.equal(swipeRight?.action, "chrome.moves.previous");
});
