import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EXPLORER_FILTERS,
  activeExplorerFilterCount,
  filtersAreDefault,
  gameMatchesFilters,
  lichessFilterQuery,
  toggleExplorerSpeed,
} from "./explorer-filters.ts";

test("default filters add nothing to the Lichess query", () => {
  assert.equal(lichessFilterQuery("lichess", DEFAULT_EXPLORER_FILTERS), "");
  assert.equal(filtersAreDefault(DEFAULT_EXPLORER_FILTERS), true);
});

test("online filters become Lichess speeds, rating bands, and months", () => {
  const filters = toggleExplorerSpeed(
    { ...DEFAULT_EXPLORER_FILTERS, minRating: 2000, sinceYear: 2018, untilYear: 2024 },
    "bullet",
  );
  const query = lichessFilterQuery("lichess", filters);
  assert.match(query, /speeds=/);
  assert.match(query, /ratings=2000%2C2200%2C2500|ratings=2000,2200,2500/);
  assert.match(query, /since=2018-01/);
  assert.match(query, /until=2024-12/);
  assert.equal(filters.speeds.includes("bullet"), false);
});

test("masters filters keep years and drop speed and rating", () => {
  const query = lichessFilterQuery("masters", {
    ...DEFAULT_EXPLORER_FILTERS,
    speeds: ["blitz"],
    minRating: 2200,
    sinceYear: 1990,
  });
  assert.match(query, /since=1990/);
  assert.equal(query.includes("speeds"), false);
  assert.equal(query.includes("ratings"), false);
});

test("personal games match rating and year", () => {
  const game = { year: 2019, whiteRating: 2100, blackRating: 1900, speed: "blitz" as const };
  assert.equal(gameMatchesFilters(game, { ...DEFAULT_EXPLORER_FILTERS, minRating: 2000 }, false), true);
  assert.equal(gameMatchesFilters(game, { ...DEFAULT_EXPLORER_FILTERS, minRating: 2200 }, false), false);
  assert.equal(gameMatchesFilters(game, { ...DEFAULT_EXPLORER_FILTERS, sinceYear: 2020 }, false), false);
});

test("activeExplorerFilterCount counts only the filters a source offers (SIG-1194)", () => {
  const all = { speed: true, rating: true };
  assert.equal(activeExplorerFilterCount(DEFAULT_EXPLORER_FILTERS, all), 0);
  assert.equal(activeExplorerFilterCount({ ...DEFAULT_EXPLORER_FILTERS, speeds: ["blitz"] }, all), 1);
  assert.equal(activeExplorerFilterCount({ ...DEFAULT_EXPLORER_FILTERS, minRating: 2000, sinceYear: 2010 }, all), 2);
  // Masters has neither speed nor rating filters: only the year range counts.
  const masters = { speed: false, rating: false };
  assert.equal(activeExplorerFilterCount({ ...DEFAULT_EXPLORER_FILTERS, speeds: ["blitz"], minRating: 2000 }, masters), 0);
  assert.equal(activeExplorerFilterCount({ ...DEFAULT_EXPLORER_FILTERS, untilYear: 2020 }, masters), 1);
});
