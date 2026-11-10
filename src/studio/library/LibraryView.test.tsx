import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LibraryView, LibraryPlaceholderList } from "./LibraryView";
import type { LibraryGamesState } from "./use-library-games";
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
  assert.ok(screen.getByText("Select a game"));
  assert.ok(screen.getByRole("separator"));
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
