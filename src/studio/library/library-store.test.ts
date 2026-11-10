import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIBRARY_FILTERS } from "@/src/lib/library/types";
import { hasActiveFilters, useLibraryStore } from "./library-store";

beforeEach(() => {
  useLibraryStore.setState({ filters: DEFAULT_LIBRARY_FILTERS, selectedKey: null, filtersOpen: false });
});

test("setters update one field each", () => {
  const s = useLibraryStore.getState();
  s.setQuery("carlsen");
  s.setColor("white");
  s.setResult("1-0");
  s.setSort({ key: "white", direction: "asc" });
  const f = useLibraryStore.getState().filters;
  assert.equal(f.query, "carlsen");
  assert.equal(f.color, "white");
  assert.equal(f.result, "1-0");
  assert.deepEqual(f.sort, { key: "white", direction: "asc" });
  assert.equal(f.opponent, "");
});

test("resetFilters clears narrowing filters but keeps sources and sort", () => {
  const s = useLibraryStore.getState();
  s.setSources(["masters"]);
  s.setSort({ key: "eco", direction: "desc" });
  s.setQuery("x");
  s.setPosition({ fen: "8/8/8/8/8/8/8/8 w - - 0 1" });
  assert.ok(hasActiveFilters(useLibraryStore.getState().filters));
  useLibraryStore.getState().resetFilters();
  const f = useLibraryStore.getState().filters;
  assert.equal(f.query, "");
  assert.equal(f.position, null);
  assert.deepEqual(f.sources, ["masters"]);
  assert.equal(f.sort.key, "eco");
  assert.equal(hasActiveFilters(f), false);
});

test("selection and popover state are independent of filters", () => {
  const before = useLibraryStore.getState().filters;
  useLibraryStore.getState().selectGame("my-games:1");
  useLibraryStore.getState().setFiltersOpen(true);
  const s = useLibraryStore.getState();
  assert.equal(s.selectedKey, "my-games:1");
  assert.equal(s.filtersOpen, true);
  assert.equal(s.filters, before);
});
