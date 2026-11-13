import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LibraryToolbar } from "./LibraryToolbar";
import { useLibraryStore } from "./library-store";
import { useStudioStore } from "@/src/store/studio-store";
import { DEFAULT_LIBRARY_FILTERS, type LibrarySourceAdapter, type LibrarySourceCapabilities } from "@/src/lib/library/types";
import { clearLibrarySources, registerLibrarySource } from "@/src/lib/library/sources";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const FULL: LibrarySourceCapabilities = {
  textSearch: "full", color: "full", result: "full", annotations: "full", position: "full", sort: "full", maxResults: null,
};
function fake(id: "my-games" | "masters", label: string, caps: LibrarySourceCapabilities = FULL): LibrarySourceAdapter {
  return { id, label: () => label, capabilities: () => caps, list: async () => ({ items: [], nextCursor: null, total: 0 }), loadPgn: async () => "" };
}
const MASTERS: LibrarySourceCapabilities = { ...FULL, color: "partial", result: "partial", annotations: "none" };

function setup(sources: ("my-games" | "masters")[], masters = MASTERS) {
  clearLibrarySources();
  registerLibrarySource(fake("my-games", "My Games"));
  registerLibrarySource(fake("masters", "Masters", masters));
  useStudioStore.setState((s) => ({ settings: { ...s.settings, locale: "en" } }));
  useLibraryStore.setState({ filters: { ...DEFAULT_LIBRARY_FILTERS, sources }, filtersOpen: true });
  render(<LibraryToolbar total={null} />);
}
beforeEach(() => setup(["my-games", "masters"]));

const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const filters = () => useLibraryStore.getState().filters;

test("segmented controls and select write their filters", () => {
  fireEvent.click(screen.getByRole("radio", { name: "White" }));
  assert.equal(filters().color, "white");
  fireEvent.click(screen.getByRole("radio", { name: "0-1" }));
  assert.equal(filters().result, "0-1");
  fireEvent.click(screen.getByRole("radio", { name: "½-½" }));
  assert.equal(filters().result, "draw");
  fireEvent.change(screen.getByLabelText("Annotations"), { target: { value: "commented" } });
  assert.equal(filters().annotations, "commented");
});

test("arrow keys move and select within a segmented control", () => {
  const both = screen.getByRole("radio", { name: "Both" });
  fireEvent.keyDown(both, { key: "ArrowRight" });
  assert.equal(filters().color, "white");
  fireEvent.keyDown(screen.getByRole("radio", { name: "White" }), { key: "ArrowLeft" });
  assert.equal(filters().color, "both");
});

test("opponent is debounced by 300 ms", async () => {
  const input = screen.getByPlaceholderText("Player name");
  fireEvent.change(input, { target: { value: "magnus" } });
  await wait(100);
  assert.equal(filters().opponent, "");
  await wait(300);
  assert.equal(filters().opponent, "magnus");
});

test("closing within the debounce window still commits the typed opponent", () => {
  fireEvent.change(screen.getByPlaceholderText("Player name"), { target: { value: "nakamura" } });
  assert.equal(filters().opponent, "");
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  assert.equal(useLibraryStore.getState().filtersOpen, false);
  assert.equal(filters().opponent, "nakamura");
});

test("partial and none support show notes; field stays enabled", () => {
  assert.equal(screen.getAllByText(/Masters: applied only to the games already returned/).length, 2);
  assert.ok(screen.getByText(/Masters: not applied/));
  assert.equal((screen.getByLabelText("Annotations") as HTMLSelectElement).disabled, false);
});

test("field is disabled when no selected source supports it", () => {
  cleanup();
  setup(["masters"]);
  assert.equal((screen.getByLabelText("Annotations") as HTMLSelectElement).disabled, true);
  assert.equal((screen.getByRole("radio", { name: "White" }) as HTMLButtonElement).disabled, false);
  assert.ok(screen.getAllByRole("tooltip").some((n) => /None of the selected sources/.test(n.textContent ?? "")));
});

test("set-position button opens the position dialog; clicks inside it keep the popover open; no highlight field", () => {
  const button = screen.getByRole("button", { name: "Set position…" }) as HTMLButtonElement;
  assert.equal(button.disabled, false);
  assert.equal(screen.queryByText("Coming soon"), null);
  fireEvent.click(button);
  const dialog = screen.getByTestId("position-filter-dialog");
  fireEvent.mouseDown(dialog);
  assert.equal(useLibraryStore.getState().filtersOpen, true);
  assert.ok(screen.getByTestId("library-filters-popover"));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  assert.equal(screen.queryByTestId("position-filter-dialog"), null);
  assert.equal(screen.queryByText(/Highlight|Beauty/), null);
});

test("position preview shows when set and clear button removes it", () => {
  act(() => useLibraryStore.getState().setPosition({ fen: "8/8/8/8/8/8/8/K6k w - - 0 1" }));
  assert.ok(screen.getByTestId("library-filters-position-preview"));
  fireEvent.click(screen.getByRole("button", { name: "Clear position" }));
  assert.equal(filters().position, null);
});

test("Clear filters resets advanced fields only", () => {
  useLibraryStore.setState({
    filters: { ...filters(), query: "carlsen", opponent: "x", color: "black", result: "1-0", annotations: "annotated", position: { fen: "8/8/8/8/8/8/8/K6k w - - 0 1" } },
  });
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  const f = filters();
  assert.equal(f.query, "carlsen");
  assert.deepEqual(f.sources, ["my-games", "masters"]);
  assert.equal(f.opponent, "");
  assert.equal(f.color, "both");
  assert.equal(f.result, "all");
  assert.equal(f.annotations, "all");
  assert.equal(f.position, null);
});

test("Escape closes and returns focus to the Filters button; outside click closes", () => {
  const trigger = screen.getByRole("button", { name: /^Filters/ });
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  assert.equal(useLibraryStore.getState().filtersOpen, false);
  assert.ok(document.activeElement === trigger, "focus returns to the Filters button");
  act(() => useLibraryStore.getState().setFiltersOpen(true));
  fireEvent.mouseDown(document.body);
  assert.equal(useLibraryStore.getState().filtersOpen, false);
});

test("focus moves inside the popover when it opens", () => {
  const pop = screen.getByTestId("library-filters-popover");
  assert.ok(pop.contains(document.activeElement));
});
