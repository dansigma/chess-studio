import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LibraryView, LibraryPlaceholderList } from "./LibraryView";
import type { LibraryGamesState } from "./use-library-games";
import { useLibraryStore } from "./library-store";
import { clampLibrarySplit } from "./library-layout";
import { clearLibrarySources, registerLibrarySource } from "@/src/lib/library/sources";
import { emptyOverview } from "@/src/lib/library/overview";
import type { LibraryGameItem } from "@/src/lib/library/types";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => {
  cleanup();
  clearLibrarySources();
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

test("loading shows skeleton rows; error offers retry; partial names sources", () => {
  const { rerender } = render(<LibraryPlaceholderList games={{ ...base, loading: true }} />);
  assert.equal(screen.getAllByTestId("library-skeleton-row").length, 8);
  rerender(<LibraryPlaceholderList games={{ ...base, error: "boom" }} />);
  assert.ok(screen.getByText("Try again"));
  rerender(<LibraryPlaceholderList games={{ ...base, sourceErrors: { masters: "x" } }} />);
  assert.ok(screen.getByText(/masters/));
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
