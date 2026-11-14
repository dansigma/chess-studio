import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LibraryView, LibraryPlaceholderList } from "./LibraryView";
import type { LibraryGamesState } from "./use-library-games";
import { useLibraryStore } from "./library-store";
import { clampLibrarySplit } from "./library-layout";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const base: LibraryGamesState = {
  items: [], total: 0, loading: false, loadingMore: false, error: null, sourceErrors: {},
  hasMore: false, loadMore: () => {}, retry: () => {},
};

test("shows the three slots and the select-a-game message", async () => {
  await act(async () => {
    render(<LibraryView />);
  });
  assert.ok(screen.getByTestId("library-toolbar-slot"));
  assert.ok(screen.getByTestId("library-table-slot"));
  assert.ok(screen.getByTestId("library-source-rail"));
  assert.equal(screen.queryByTestId("library-source-bar"), null);
  assert.ok(screen.getByText("Select a game"));
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
