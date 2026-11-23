import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LibraryView, LibraryPlaceholderList } from "./LibraryView";
import type { LibraryGamesState } from "./use-library-games";
import { useStudioStore } from "@/src/store/studio-store";
import { useLibraryStore } from "./library-store";
import { clampLibrarySplit } from "./library-layout";
import { clearLibrarySources, registerLibrarySource } from "@/src/lib/library/sources";
import { emptyOverview } from "@/src/lib/library/overview";
import type { LibraryGameItem } from "@/src/lib/library/types";

before(() => {
  setupDom();
  useStudioStore.setState({ filesHydrated: true });
});
const realMatchMedia = window.matchMedia;
function setPhone(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
after(() => teardownDom());
afterEach(() => {
  cleanup();
  clearLibrarySources();
  useLibraryStore.setState({ selectedKey: null });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: realMatchMedia,
  });
});

const base: LibraryGamesState = {
  items: [], total: 0, loading: false, loadingMore: false, error: null, sourceErrors: {},
  hasMore: false, loadMore: () => {}, retry: () => {},
};

const ITEM: LibraryGameItem = {
  key: "my-games:1", sourceId: "my-games", gameId: "1",
  white: "Carlsen", whiteElo: 2850, black: "Caruana", blackElo: 2800,
  result: "1-0", eco: "C65", opening: "Berlin Defence", plyCount: null, event: null, date: "2020",
};
const PGN = '[Event "Test"]\n[White "Carlsen"]\n[Black "Caruana"]\n[Result "1-0"]\n\n1. e4 e5 1-0';

test("shows the three slots and the database summary in the preview panel", async () => {
  await act(async () => {
    render(<LibraryView />);
  });
  assert.ok(screen.getByTestId("library-toolbar-slot"));
  assert.ok(screen.getByTestId("library-table-slot"));
  assert.ok(screen.getByTestId("library-source-rail"));
  assert.equal(screen.queryByTestId("library-source-bar"), null);
  assert.ok(screen.getByTestId("library-summary"));
  assert.equal(screen.queryByTestId("library-preview"), null);
  assert.ok(screen.getByRole("separator"));
});

test("games mode: one header row holds tabs, search, Filters and counter; no chips row without filters", async () => {
  useLibraryStore.setState({ mode: "games" });
  await act(async () => {
    render(<LibraryView />);
  });
  const header = screen.getByTestId("library-header");
  const tablist = screen.getByRole("tablist");
  const slot = screen.getByTestId("library-toolbar-slot");
  assert.ok(header.contains(tablist));
  assert.ok(header.contains(slot));
  assert.equal(slot.getAttribute("role"), "search");
  assert.ok(slot.contains(screen.getByRole("textbox")));
  assert.ok(slot.contains(screen.getByRole("button", { name: /^Filters/ })));
  assert.ok(header.contains(screen.getByTestId("library-counter")));
  assert.ok(header.className.includes("flex-nowrap"));
  assert.equal(screen.queryByTestId("library-chips-row"), null);
});

test("players mode: the header row shows only the tabs", async () => {
  useLibraryStore.setState({ mode: "players" });
  await act(async () => {
    render(<LibraryView />);
  });
  const header = screen.getByTestId("library-header");
  assert.ok(header.contains(screen.getByRole("tablist")));
  assert.equal(screen.queryByTestId("library-toolbar-slot"), null);
  assert.equal(screen.queryByTestId("library-counter"), null);
  fireEvent.click(screen.getByRole("tab", { name: "Games" }));
  assert.ok(screen.getByTestId("library-toolbar-slot"));
  useLibraryStore.setState({ mode: "games" });
});

test("loading shows skeleton rows; error offers retry; partial names sources and offers retry", () => {
  let retried = 0;
  const retry = () => { retried++; };
  const { rerender } = render(<LibraryPlaceholderList games={{ ...base, loading: true, retry }} />);
  assert.equal(screen.getAllByTestId("library-skeleton-row").length, 8);
  rerender(<LibraryPlaceholderList games={{ ...base, error: "boom", retry }} />);
  assert.ok(screen.getByText("Try again"));
  rerender(<LibraryPlaceholderList games={{ ...base, sourceErrors: { masters: "x" }, retry }} />);
  const status = screen.getByRole("status");
  assert.match(status.textContent ?? "", /masters/);
  fireEvent.click(within(status).getByRole("button", { name: "Try again" }));
  assert.equal(retried, 1);
});

test("split is clamped", () => {
  assert.equal(clampLibrarySplit(5), 30);
  assert.equal(clampLibrarySplit(99), 85);
  assert.equal(clampLibrarySplit(NaN), 65);
});

test("the right panel shows the summary with no selection and the preview after selecting, back on deselect", async () => {
  registerLibrarySource({
    id: "my-games",
    label: () => "My Games",
    capabilities: () => ({}) as never,
    list: async () => ({ items: [ITEM], nextCursor: null, total: 1 }),
    loadPgn: async () => PGN,
    overview: async () => emptyOverview(),
  });
  useLibraryStore.setState({ filters: { ...useLibraryStore.getState().filters, sources: ["my-games"] } });
  await act(async () => {
    render(<LibraryView />);
  });
  assert.ok(screen.getByTestId("library-summary"));
  const row = await screen.findByTestId("library-row");
  fireEvent.click(row);
  await screen.findByTestId("library-preview");
  assert.equal(screen.queryByTestId("library-summary"), null);

  fireEvent.keyDown(screen.getByRole("grid"), { key: "Escape" });
  assert.ok(screen.getByTestId("library-summary"));
  assert.equal(useLibraryStore.getState().selectedKey, null);
});

test("mobile: full-width table, Sources button opens BottomSheet, tapping game opens preview BottomSheet", async () => {
  setPhone(true);
  registerLibrarySource({
    id: "my-games",
    label: () => "My Games",
    capabilities: () => ({}) as never,
    list: async () => ({ items: [ITEM], nextCursor: null, total: 1 }),
    loadPgn: async () => PGN,
    overview: async () => emptyOverview(),
  });
  useLibraryStore.setState({
    mode: "games",
    selectedKey: null,
    filters: { ...useLibraryStore.getState().filters, sources: ["my-games"] },
  });

  await act(async () => {
    render(<LibraryView />);
  });

  assert.ok(screen.getByTestId("library-table-slot"));
  assert.equal(screen.queryByRole("separator"), null);
  assert.equal(screen.queryByTestId("library-source-rail"), null);
  assert.equal(screen.queryByTestId("library-summary"), null);
  assert.ok(screen.getByTestId("library-header").className.includes("flex-wrap"));

  // Sources trigger opens LibrarySourceRail inside a BottomSheet.
  fireEvent.click(screen.getByTestId("library-sources-button"));
  const sourcesSheet = document.querySelector("[data-mobile-menu-sheet]") as HTMLElement;
  assert.ok(sourcesSheet);
  assert.ok(within(sourcesSheet).getByTestId("library-source-rail"));
  fireEvent.click(within(sourcesSheet).getByRole("button", { name: "Close" }));
  assert.equal(document.querySelector("[data-mobile-menu-sheet]"), null);

  // Tapping a game opens LibraryPreview inside a BottomSheet.
  const row = await screen.findByTestId("library-row");
  fireEvent.click(row);
  await screen.findByTestId("library-preview");
  const previewSheet = document.querySelector("[data-mobile-menu-sheet]") as HTMLElement;
  assert.ok(previewSheet);
  assert.ok(within(previewSheet).getByTestId("library-preview"));
  assert.ok(within(previewSheet).getByRole("button", { name: "Open in Studio" }));

  // Closing the preview sheet clears the selection.
  fireEvent.click(within(previewSheet).getByRole("button", { name: "Close" }));
  assert.equal(useLibraryStore.getState().selectedKey, null);
  assert.equal(screen.queryByTestId("library-preview"), null);
});

test("mobile: Escape in a Sources-sheet menu or dialog closes only that layer, not the sheet", async () => {
  setPhone(true);
  useLibraryStore.setState({ mode: "games", selectedKey: null });
  await act(async () => {
    render(<LibraryView />);
  });
  fireEvent.click(screen.getByTestId("library-sources-button"));
  const sheet = () => document.querySelector("[data-mobile-menu-sheet]") as HTMLElement | null;
  assert.ok(sheet());

  // Import menu open: the first Escape closes the menu, the sheet stays.
  fireEvent.click(within(sheet()!).getByRole("button", { name: "+ Import PGN" }));
  const menu = screen.getByRole("menu", { name: "+ Import PGN" });
  fireEvent.keyDown(menu, { key: "Escape" });
  assert.equal(screen.queryByRole("menu", { name: "+ Import PGN" }), null);
  assert.ok(sheet());

  // Paste PGN dialog open: Escape closes the dialog and keeps the sheet.
  fireEvent.click(within(sheet()!).getByRole("button", { name: "+ Import PGN" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Paste PGN" }));
  assert.equal(document.querySelectorAll('[role="dialog"][aria-modal="true"]').length, 2);
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  assert.equal(document.querySelectorAll('[role="dialog"][aria-modal="true"]').length, 1);
  assert.ok(sheet());

  // With nothing on top, Escape closes the sheet.
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  assert.equal(sheet(), null);
});

test("the placeholder list shows the Library loading status, not an empty state, before the local Library loads", () => {
  useStudioStore.setState({ filesHydrated: false });
  try {
    render(<LibraryPlaceholderList games={{ ...base, retry: () => {} }} />);
    assert.match(screen.getByRole("status").textContent ?? "", /Loading your Library/i);
  } finally {
    useStudioStore.setState({ filesHydrated: true });
  }
});
