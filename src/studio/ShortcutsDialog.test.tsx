// SIG-1383: the shortcuts dialog lists every registry entry (translated
// action text + <kbd> chords) and closes on Escape.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";
import { SHORTCUT_ENTRIES, SHORTCUT_GROUP_ORDER } from "./shortcuts-registry.ts";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings.ts";
import { useStudioStore } from "@/src/store/studio-store.ts";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings.ts";

before(() => setupDom());
after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  act(() => {
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });
  });
});

test("dialog lists every registry entry in pt-br with kbd chords", () => {
  render(<ShortcutsDialog onClose={() => {}} />);
  assert.ok(screen.getByRole("dialog"));
  assert.ok(screen.getByText("Atalhos de teclado e gestos"));

  for (const group of SHORTCUT_GROUP_ORDER) {
    assert.ok(
      screen.getByText(tStudioChrome("pt-br", `chrome.shortcuts.group.${group}`)),
      `missing group heading: ${group}`,
    );
  }

  for (const entry of SHORTCUT_ENTRIES) {
    assert.ok(
      screen.getAllByText(tStudioChrome("pt-br", entry.action)).length > 0,
      `missing action: ${entry.action}`,
    );
    if (entry.gesture) {
      assert.ok(
        screen.getAllByText(tStudioChrome("pt-br", entry.gesture)).length > 0,
        `missing gesture: ${entry.gesture}`,
      );
    }
  }

  // Every chord label renders inside a <kbd> element (scoped to the lists —
  // the dialog chrome itself shows an "Esc" kbd in the close button/hint).
  const expectedKbdCount = SHORTCUT_ENTRIES.reduce(
    (count, entry) => count + (entry.chords?.reduce((n, chord) => n + chord.length, 0) ?? 0),
    0,
  );
  const kbds = document.querySelectorAll("[role='dialog'] ul kbd");
  assert.equal(kbds.length, expectedKbdCount);
  const kbdTexts = [...kbds].map((kbd) => kbd.textContent);
  for (const entry of SHORTCUT_ENTRIES) {
    for (const chord of entry.chords ?? []) {
      for (const key of chord) {
        assert.ok(kbdTexts.includes(key), `missing kbd for key: ${key}`);
      }
    }
  }
});

test("dialog closes on Escape", () => {
  let closed = 0;
  render(<ShortcutsDialog onClose={() => { closed += 1; }} />);
  fireEvent.keyDown(window, { key: "Escape" });
  assert.equal(closed, 1);
});
