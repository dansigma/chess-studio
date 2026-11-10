import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIBRARY_FILTERS, type LibrarySourceCapabilities } from "@/src/lib/library/types";
import {
  buildFilterChips,
  chipRemovalPatch,
  countAdvancedFilters,
  formatGameCount,
  type ChipSource,
} from "./filter-chips";

const FULL: LibrarySourceCapabilities = {
  textSearch: "full", color: "full", result: "full", annotations: "full", position: "full", sort: "full", maxResults: null,
};
const sources: ChipSource[] = [
  { id: "my-games", label: "My Games", capabilities: FULL },
  { id: "masters", label: "Masters (Lichess)", capabilities: { ...FULL, textSearch: "partial", color: "none", maxResults: 15 } },
];
const all = { ...DEFAULT_LIBRARY_FILTERS, sources: ["my-games", "masters"] as const };
const f = (patch: object) => ({ ...all, sources: [...all.sources], ...patch });

test("no chips for default filters or when all sources are selected", () => {
  assert.deepEqual(buildFilterChips(f({}), sources, "en"), []);
});

test("source chips only when not all sources are selected", () => {
  const chips = buildFilterChips(f({ sources: ["masters"] }), sources, "en");
  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, "Database: Masters (Lichess)");
  assert.equal(chips[0].removable, false); // last source
});

test("one chip per non-default field, labels localized", () => {
  const chips = buildFilterChips(
    f({ query: " sicilian ", opponent: "Nakamura", color: "white", result: "1-0", annotations: "commented", position: { fen: "8/8/8/8/8/8/8/8 w - - 0 1" } }),
    sources,
    "pt-br",
  );
  assert.deepEqual(chips.map((c) => c.field), ["query", "opponent", "color", "result", "annotations", "position"]);
  assert.equal(chips[0].label, "Busca: sicilian");
  assert.equal(chips[1].label, "Oponente: Nakamura");
  assert.equal(chips[2].label, "Cor: Brancas");
  assert.equal(chips[4].label, "Anotações: Comentadas");
});

test("removal resets only that field", () => {
  const filters = f({ query: "x", opponent: "y", color: "black", result: "draw", annotations: "annotated", position: { fen: "f" } });
  const chips = buildFilterChips(filters, sources, "en");
  const patches = Object.fromEntries(chips.map((c) => [c.field, chipRemovalPatch(filters, c)]));
  assert.deepEqual(patches.query, { query: "" });
  assert.deepEqual(patches.opponent, { opponent: "" });
  assert.deepEqual(patches.color, { color: "both" });
  assert.deepEqual(patches.result, { result: "all" });
  assert.deepEqual(patches.annotations, { annotations: "all" });
  assert.deepEqual(patches.position, { position: null });
  const src = buildFilterChips(f({ sources: ["my-games", "masters"].slice(0, 1) }), sources, "en")[0];
  assert.deepEqual(chipRemovalPatch(f({}), src), { sources: ["masters"] });
});

test("chips name sources that apply the filter only partly or not at all", () => {
  const chips = buildFilterChips(f({ opponent: "a", color: "white", result: "1-0" }), sources, "en");
  assert.deepEqual(chips[0].limitedBy, ["Masters (Lichess)"]); // partial text search
  assert.deepEqual(chips[1].limitedBy, ["Masters (Lichess)"]); // no color
  assert.deepEqual(chips[2].limitedBy, []);
  // an unselected source is not named
  const only = buildFilterChips(f({ sources: ["my-games"], color: "white" }), sources, "en");
  assert.deepEqual(only.find((c) => c.field === "color")?.limitedBy, []);
});

test("advanced count ignores search, sources and sort", () => {
  assert.equal(countAdvancedFilters(f({ query: "x" })), 0);
  assert.equal(countAdvancedFilters(f({ opponent: "a", color: "white", result: "1-0" })), 3);
});

test("game count follows the locale", () => {
  assert.equal(formatGameCount(1234, "pt-br"), "1.234");
  assert.equal(formatGameCount(1234, "en"), "1,234");
});
