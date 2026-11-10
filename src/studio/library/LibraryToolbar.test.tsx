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

const FULL = {
  textSearch: "full", color: "full", result: "full", annotations: "full", position: "full", sort: "full", maxResults: null,
} satisfies LibrarySourceCapabilities;

function fake(id: "my-games" | "masters", label: string, caps: LibrarySourceCapabilities = FULL): LibrarySourceAdapter {
  return {
    id,
    label: () => label,
    capabilities: () => caps,
    list: async () => ({ items: [], nextCursor: null, total: 0 }),
    loadPgn: async () => "",
  };
}

beforeEach(() => {
  clearLibrarySources();
  registerLibrarySource(fake("my-games", "My Games"));
  registerLibrarySource(fake("masters", "Masters (Lichess)", { ...FULL, color: "none" }));
  useStudioStore.setState((s) => ({ settings: { ...s.settings, locale: "en" } }));
  useLibraryStore.setState({
    filters: { ...DEFAULT_LIBRARY_FILTERS, sources: ["my-games", "masters"] },
    filtersOpen: false,
  });
});

const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

test("search is debounced by 300 ms and Escape clears", async () => {
  render(<LibraryToolbar total={null} sourceErrors={{}} />);
  const input = screen.getByPlaceholderText(/Search players/) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "carlsen" } });
  await wait(100);
  assert.equal(useLibraryStore.getState().filters.query, "");
  await wait(300);
  assert.equal(useLibraryStore.getState().filters.query, "carlsen");
  fireEvent.keyDown(input, { key: "Escape" });
  assert.equal(useLibraryStore.getState().filters.query, "");
  assert.equal(input.value, "");
});

test("counter shows selected sources and a locale-formatted total", () => {
  const { rerender } = render(<LibraryToolbar total={1234} sourceErrors={{}} />);
  assert.ok(screen.getByTestId("library-counter").textContent?.includes("Selected databases: 2 of 2 · 1,234 games"));
  rerender(<LibraryToolbar total={null} sourceErrors={{}} />);
  assert.equal(screen.getByTestId("library-counter").textContent, "Selected databases: 2 of 2");
  act(() => useStudioStore.setState((s) => ({ settings: { ...s.settings, locale: "pt-br" } })));
  rerender(<LibraryToolbar total={1234} sourceErrors={{}} />);
  assert.equal(screen.getByTestId("library-counter").textContent, "Bases selecionadas: 2 de 2 · 1.234 partidas");
});

test("last selected source cannot be unchecked; select all restores", () => {
  render(<LibraryToolbar total={0} sourceErrors={{ masters: "boom" }} />);
  fireEvent.click(screen.getByRole("button", { name: /Databases/ }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Masters/ }));
  assert.deepEqual(useLibraryStore.getState().filters.sources, ["my-games"]);
  const last = screen.getByRole("menuitemcheckbox", { name: /My Games/ }) as HTMLButtonElement;
  assert.equal(last.disabled, true);
  fireEvent.click(last);
  assert.deepEqual(useLibraryStore.getState().filters.sources, ["my-games"]);
  assert.ok(screen.getByRole("img", { name: /Failed to load: boom/ }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Select all" }));
  assert.equal(useLibraryStore.getState().filters.sources.length, 2);
});

test("chips remove one field, Clear all appears from two chips, badge counts advanced filters", () => {
  useLibraryStore.setState((s) => ({ filters: { ...s.filters, color: "white", result: "1-0" } }));
  render(<LibraryToolbar total={0} sourceErrors={{}} />);
  assert.equal(screen.getAllByTestId("library-chip").length, 2);
  assert.ok(screen.getByRole("button", { name: "Filters, 2 active" }));
  assert.ok(screen.getByRole("img", { name: /Masters \(Lichess\)/ })); // color unsupported by Masters
  fireEvent.click(screen.getByRole("button", { name: "Remove filter: Color: White" }));
  assert.equal(useLibraryStore.getState().filters.color, "both");
  assert.equal(useLibraryStore.getState().filters.result, "1-0");
  assert.equal(screen.queryByText("Clear all"), null);
});

test("Clear all resets chips; Filters button toggles filtersOpen", () => {
  useLibraryStore.setState((s) => ({ filters: { ...s.filters, sources: ["masters"], opponent: "Nakamura" } }));
  render(<LibraryToolbar total={0} sourceErrors={{}} />);
  fireEvent.click(screen.getByText("Clear all"));
  const { filters } = useLibraryStore.getState();
  assert.equal(filters.opponent, "");
  assert.equal(filters.sources.length, 2);
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  assert.equal(useLibraryStore.getState().filtersOpen, true);
});
