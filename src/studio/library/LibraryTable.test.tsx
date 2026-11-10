import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LibraryTable } from "./LibraryTable";
import { useLibraryStore } from "./library-store";
import { DEFAULT_LIBRARY_FILTERS, type LibraryGameItem } from "@/src/lib/library/types";
import type { LibraryGamesState } from "./use-library-games";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => {
  cleanup();
  useLibraryStore.setState({ filters: DEFAULT_LIBRARY_FILTERS, selectedKey: null });
});

function item(n: number): LibraryGameItem {
  return {
    key: `my-games:${n}`, sourceId: "my-games", gameId: String(n),
    white: `W${n}`, whiteElo: 2000 + n, black: `B${n}`, blackElo: null,
    result: n % 3 === 0 ? "1-0" : n % 3 === 1 ? "0-1" : "1/2-1/2",
    eco: "C20", opening: "King's Pawn", plyCount: 41, event: null, date: "2024",
  };
}

function games(count: number, extra: Partial<LibraryGamesState> = {}): LibraryGamesState {
  return {
    items: Array.from({ length: count }, (_, i) => item(i)), total: count, loading: false,
    loadingMore: false, error: null, sourceErrors: {}, hasMore: false, loadMore: () => {}, retry: () => {},
    ...extra,
  };
}

test("renders only a window of 5000 rows, with dashes and move counts", () => {
  render(<LibraryTable games={games(5000)} />);
  const rows = screen.getAllByTestId("library-row");
  assert.ok(rows.length > 0 && rows.length < 60);
  assert.ok(screen.getAllByText("21").length > 0);
  assert.ok(screen.getAllByText("—").length > 0);
});

test("header click sorts, a second click flips, aria-sort follows", () => {
  render(<LibraryTable games={games(5)} />);
  const header = screen.getByRole("columnheader", { name: "White" });
  assert.equal(header.getAttribute("aria-sort"), "none");
  fireEvent.click(header.querySelector("button")!);
  assert.deepEqual(useLibraryStore.getState().filters.sort, { key: "white", direction: "asc" });
  assert.equal(screen.getByRole("columnheader", { name: "White" }).getAttribute("aria-sort"), "ascending");
  fireEvent.click(screen.getByRole("columnheader", { name: "White" }).querySelector("button")!);
  assert.equal(useLibraryStore.getState().filters.sort.direction, "desc");
});

test("click and arrow keys move the selection", () => {
  render(<LibraryTable games={games(5)} />);
  fireEvent.click(screen.getAllByTestId("library-row")[1]!);
  assert.equal(useLibraryStore.getState().selectedKey, "my-games:1");
  const grid = screen.getByRole("grid");
  fireEvent.keyDown(grid, { key: "ArrowDown" });
  assert.equal(useLibraryStore.getState().selectedKey, "my-games:2");
  fireEvent.keyDown(grid, { key: "ArrowUp" });
  fireEvent.keyDown(grid, { key: "ArrowUp" });
  assert.equal(useLibraryStore.getState().selectedKey, "my-games:0");
  assert.equal(screen.getAllByTestId("library-row")[0]!.getAttribute("aria-selected"), "true");
});

test("loadMore fires near the end and shows the loading row", async () => {
  let calls = 0;
  const { rerender } = render(<LibraryTable games={games(20, { hasMore: true, loadMore: () => { calls++; } })} />);
  await act(async () => {});
  assert.ok(calls >= 1);
  rerender(<LibraryTable games={games(20, { hasMore: true, loadingMore: true })} />);
  assert.ok(screen.getByTestId("library-loading-row"));
});

test("does not load more when nothing more exists", async () => {
  let calls = 0;
  render(<LibraryTable games={games(50, { loadMore: () => { calls++; } })} />);
  await act(async () => {});
  assert.equal(calls, 0);
});
