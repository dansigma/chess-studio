import assert from "node:assert/strict";
import test from "node:test";
import { clampDepth, clampLines, clampThreads } from "../../engine/stockfish-client.ts";
import { DEFAULT_EXPLORER_FILTERS } from "../../lib/explorer-filters.ts";
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "../../studio/sidebar-width.ts";
import { emptyBoard, newId } from "./board-helpers.ts";
import { EXPLAIN_LOCALES } from "../../chess/explain/locale.ts";
import { SITE_LOCALES } from "../../i18n/locale.ts";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  type SettingsSlice,
} from "./settings.ts";
import { useStudioStore } from "../studio-store.ts";

// SIG-944: the settings actions moved out of studio-store.ts into this slice.
// These tests pin the move-invariant behaviour: the composer must still expose
// the same actions with the same clamping/merge semantics. Importing the store
// pulls in slices/files.ts, which reads localStorage at module init, so a
// Map-backed stub is installed after the import (node --test runs each file in
// its own process, so it cannot leak into other suites).
const storage = new Map<string, string>();

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  },
};

function actions(): SettingsSlice {
  return useStudioStore.getState();
}

function resetSettings(): void {
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS } });
}

test("toggles flip the matching settings field", () => {
  resetSettings();
  actions().toggleCoordinates();
  actions().toggleMoveSound();
  actions().toggleEvalBar();
  actions().toggleSidebar();
  const settings = useStudioStore.getState().settings;
  assert.equal(settings.showCoordinates, !DEFAULT_SETTINGS.showCoordinates);
  assert.equal(settings.moveSound, !DEFAULT_SETTINGS.moveSound);
  assert.equal(settings.showEvalBar, !DEFAULT_SETTINGS.showEvalBar);
  assert.equal(settings.sidebarCollapsed, !DEFAULT_SETTINGS.sidebarCollapsed);
});

test("toggleNotationDensity flips compact/normal", () => {
  resetSettings();
  actions().toggleNotationDensity();
  assert.equal(useStudioStore.getState().settings.notationDensity, "compact");
  actions().toggleNotationDensity();
  assert.equal(useStudioStore.getState().settings.notationDensity, "normal");
});

test("engine setters clamp through the stockfish helpers", () => {
  resetSettings();
  actions().setEngineDepth(999);
  actions().setMultiPv(999);
  actions().setEngineThreads(999);
  const settings = useStudioStore.getState().settings;
  assert.equal(settings.engineDepth, clampDepth(999));
  assert.equal(settings.multiPv, clampLines(999));
  assert.equal(settings.engineThreads, clampThreads(999));
});

test("setExplorerFilters shallow-merges the patch", () => {
  resetSettings();
  actions().setExplorerFilters({ minRating: 1800 });
  const filters = useStudioStore.getState().settings.explorerFilters;
  assert.equal(filters.minRating, 1800);
  assert.deepEqual(filters.speeds, DEFAULT_EXPLORER_FILTERS.speeds);
});

test("setSidebarWidth updates and clamps sidebar width", () => {
  resetSettings();
  actions().setSidebarWidth(320);
  assert.equal(useStudioStore.getState().settings.sidebarWidth, 320);

  actions().setSidebarWidth(100);
  assert.equal(useStudioStore.getState().settings.sidebarWidth, MIN_SIDEBAR_WIDTH);

  actions().setSidebarWidth(999);
  assert.equal(useStudioStore.getState().settings.sidebarWidth, MAX_SIDEBAR_WIDTH);

  actions().setSidebarWidth(NaN);
  assert.equal(useStudioStore.getState().settings.sidebarWidth, DEFAULT_SIDEBAR_WIDTH);
});

test("hydrateSettings merges only the persisted fields and clamps engine values", () => {
  resetSettings();
  useStudioStore.setState({
    settings: { ...DEFAULT_SETTINGS, colorScheme: "light", moveSound: true },
  });
  actions().hydrateSettings({
    boardTheme: "wood",
    engineDepth: 999,
    multiPv: 999,
    engineThreads: 999,
    sidebarWidth: 350,
  });
  const settings = useStudioStore.getState().settings;
  assert.equal(settings.boardTheme, "wood");
  assert.equal(settings.engineDepth, clampDepth(999));
  assert.equal(settings.multiPv, clampLines(999));
  assert.equal(settings.engineThreads, clampThreads(999));
  assert.equal(settings.sidebarWidth, 350);
  // local-only fields survive a remote hydrate.
  assert.equal(settings.colorScheme, "light");
  assert.equal(settings.moveSound, true);
});

test("hydrateLocalSettings reads the persisted settings key and restores sidebarWidth", () => {
  resetSettings();
  storage.set(
    SETTINGS_KEY,
    JSON.stringify({
      ...DEFAULT_SETTINGS,
      boardTheme: "wood",
      engineDepth: 20,
      sidebarWidth: 180,
    }),
  );
  actions().hydrateLocalSettings();
  const settings = useStudioStore.getState().settings;
  assert.equal(settings.boardTheme, "wood");
  assert.equal(settings.engineDepth, 20);
  assert.equal(settings.sidebarWidth, 180);
  storage.delete(SETTINGS_KEY);
});

test("moveSound defaults to off and respects the persisted value", () => {
  // SIG-951: fresh guests start silent; the user opts in from the View menu.
  assert.equal(DEFAULT_SETTINGS.moveSound, false);

  storage.delete(SETTINGS_KEY);
  resetSettings();
  actions().hydrateLocalSettings();
  assert.equal(useStudioStore.getState().settings.moveSound, false);

  for (const persisted of [true, false]) {
    storage.set(SETTINGS_KEY, JSON.stringify({ moveSound: persisted }));
    actions().hydrateLocalSettings();
    assert.equal(useStudioStore.getState().settings.moveSound, persisted);
  }

  storage.delete(SETTINGS_KEY);
  resetSettings();
});

test("hydrateLocalSettings clamps out-of-range persisted sidebarWidth", () => {
  resetSettings();
  storage.set(
    SETTINGS_KEY,
    JSON.stringify({
      ...DEFAULT_SETTINGS,
      sidebarWidth: 50,
    }),
  );
  actions().hydrateLocalSettings();
  assert.equal(useStudioStore.getState().settings.sidebarWidth, MIN_SIDEBAR_WIDTH);

  storage.set(
    SETTINGS_KEY,
    JSON.stringify({
      ...DEFAULT_SETTINGS,
      sidebarWidth: 900,
    }),
  );
  actions().hydrateLocalSettings();
  assert.equal(useStudioStore.getState().settings.sidebarWidth, MAX_SIDEBAR_WIDTH);
  storage.delete(SETTINGS_KEY);
});

test("toggleGamePreview off clears every preview board, on keeps them", () => {
  resetSettings();
  const previewA = { ...emptyBoard(), id: newId(), preview: true };
  const previewB = { ...emptyBoard(), id: newId(), preview: true };
  const pinned = { ...emptyBoard(), id: newId(), preview: false };
  useStudioStore.setState({ boards: [previewA, previewB, pinned], activeBoardId: previewA.id });

  actions().toggleGamePreview();
  const off = useStudioStore.getState();
  assert.equal(off.settings.gamePreviewEnabled, false);
  assert.deepEqual(off.boards.map((board) => board.preview), [false, false, false]);

  actions().toggleGamePreview();
  assert.equal(useStudioStore.getState().settings.gamePreviewEnabled, true);
});

test("pinPreviewBoard clears only the matching preview board", () => {
  resetSettings();
  const previewA = { ...emptyBoard(), id: newId(), preview: true };
  const previewB = { ...emptyBoard(), id: newId(), preview: true };
  useStudioStore.setState({ boards: [previewA, previewB], activeBoardId: previewA.id });

  actions().pinPreviewBoard(previewA.id);
  const boards = useStudioStore.getState().boards;
  assert.equal(boards.find((board) => board.id === previewA.id)?.preview, false);
  assert.equal(boards.find((board) => board.id === previewB.id)?.preview, true);
});

test("locale defaults to the browser language and respects a valid persisted value", () => {
  // SIG-971: the browser language seeds the *site* language for fresh installs;
  // Game Review explanations follow that same setting (no separate review locale).
  const win = (globalThis as { window?: { navigator?: { language: string } } }).window;
  assert.ok(win);
  try {
    storage.delete(SETTINGS_KEY);
    win.navigator = { language: "pt-BR" };
    resetSettings();
    actions().hydrateLocalSettings();
    assert.equal(useStudioStore.getState().settings.locale, "pt-br");

    win.navigator = { language: "en-US" };
    actions().hydrateLocalSettings();
    assert.equal(useStudioStore.getState().settings.locale, "en");

    storage.set(SETTINGS_KEY, JSON.stringify({ locale: "pt-br" }));
    actions().hydrateLocalSettings();
    assert.equal(useStudioStore.getState().settings.locale, "pt-br");

    // An unknown persisted value is ignored in favour of the browser language.
    storage.set(SETTINGS_KEY, JSON.stringify({ locale: "klingon" }));
    win.navigator = { language: "pt" };
    actions().hydrateLocalSettings();
    assert.equal(useStudioStore.getState().settings.locale, "pt-br");
  } finally {
    delete win.navigator;
    storage.delete(SETTINGS_KEY);
    resetSettings();
  }
});

test("game review explanations share the site locale list (single language setting)", () => {
  // SIG-971: Game Review has no separate language — the explain layer renders
  // in settings.locale, so its locale list must stay identical to the site list.
  assert.deepEqual([...EXPLAIN_LOCALES], [...SITE_LOCALES]);
});

test("setLocale updates the setting and remote hydration only accepts valid locales", () => {
  resetSettings();
  actions().setLocale("pt-br");
  assert.equal(useStudioStore.getState().settings.locale, "pt-br");
  actions().hydrateSettings({ locale: "en" });
  assert.equal(useStudioStore.getState().settings.locale, "en");
  actions().hydrateSettings({ locale: "xx" as never });
  assert.equal(useStudioStore.getState().settings.locale, "en");
  resetSettings();
});
