import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_CATALOG_QUERY,
  filterCatalog,
  isCatalogQueryEmpty,
  parseCatalogQuery,
  serializeCatalogQuery,
} from "./catalog-filter.ts";
import type { CatalogCourse } from "./types.ts";

function c(id: string, o: Partial<CatalogCourse>): CatalogCourse {
  return {
    id,
    slug: id,
    title: id,
    summary: "<p>text</p>",
    theme: "openings",
    color: "white",
    accessTier: "free",
    priceCents: null,
    level: "beginner",
    eloMin: null,
    eloMax: null,
    language: "pt-br",
    durationMinutes: null,
    chapterCount: 1,
    moveCount: 1,
    variationIds: [],
    variationTitles: {},
    ...o,
  };
}

const list = [
  c("a", { title: "Defesa Siciliana", color: "black", level: "intermediate", authorName: "João Silva" }),
  c("b", { title: "Finais de Torre", theme: "endgames", level: "advanced", summary: "<p>Técnica de <b>ação</b></p>" }),
  c("c", { title: "Italiana", color: "black", level: "beginner" }),
];
const ids = (xs: CatalogCourse[]) => xs.map((x) => x.id);
const q = (o: Partial<typeof EMPTY_CATALOG_QUERY>) => ({ ...EMPTY_CATALOG_QUERY, ...o });

describe("filterCatalog", () => {
  it("returns everything for an empty query", () => {
    assert.deepEqual(ids(filterCatalog(list, EMPTY_CATALOG_QUERY)), ["a", "b", "c"]);
  });
  it("filters each group", () => {
    assert.deepEqual(ids(filterCatalog(list, q({ colors: ["black"] }))), ["a", "c"]);
    assert.deepEqual(ids(filterCatalog(list, q({ levels: ["advanced"] }))), ["b"]);
    assert.deepEqual(ids(filterCatalog(list, q({ themes: ["endgames"] }))), ["b"]);
  });
  it("ORs within a group and ANDs across groups", () => {
    assert.deepEqual(ids(filterCatalog(list, q({ levels: ["beginner", "intermediate"] }))), ["a", "c"]);
    assert.deepEqual(ids(filterCatalog(list, q({ colors: ["black"], levels: ["beginner"] }))), ["c"]);
  });
  it("searches title, description and author ignoring case and accents", () => {
    assert.deepEqual(ids(filterCatalog(list, q({ q: "SICILIANA" }))), ["a"]);
    assert.deepEqual(ids(filterCatalog(list, q({ q: "acao" }))), ["b"]);
    assert.deepEqual(ids(filterCatalog(list, q({ q: "joao" }))), ["a"]);
  });
  it("combines search with pills and can match nothing", () => {
    assert.deepEqual(ids(filterCatalog(list, q({ q: "italiana", colors: ["white"] }))), []);
  });
});

describe("catalog query URL", () => {
  it("round-trips", () => {
    const query = {
      q: "são",
      colors: ["black" as const],
      levels: ["beginner" as const, "advanced" as const],
      themes: ["tactics" as const],
    };
    assert.deepEqual(parseCatalogQuery(new URLSearchParams(serializeCatalogQuery(query))), query);
  });
  it("serializes empty to an empty string", () => {
    assert.equal(serializeCatalogQuery(EMPTY_CATALOG_QUERY), "");
    assert.equal(serializeCatalogQuery(q({ q: "  " })), "");
  });
  it("drops unknown and duplicate values", () => {
    const parsed = parseCatalogQuery(new URLSearchParams("color=red,black,black&level=x&theme=,endgames"));
    assert.deepEqual(parsed, q({ colors: ["black"], themes: ["endgames"] }));
  });
  it("detects empty queries", () => {
    assert.equal(isCatalogQueryEmpty(q({ q: " " })), true);
    assert.equal(isCatalogQueryEmpty(q({ themes: ["openings"] })), false);
  });
});
