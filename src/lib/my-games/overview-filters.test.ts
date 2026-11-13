// SIG-1305: filterGames + overviewKpis.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlayerGame } from "../player-types.ts";
import { filterGames, overviewKpis, DEFAULT_OVERVIEW_FILTERS } from "./overview-filters.ts";

const NOW = Date.UTC(2026, 10, 12);
const DAY = 86_400_000;

function g(id: string, over: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id, winner: null, whiteName: "U", whiteRating: null, blackName: "O", blackRating: null,
    year: null, month: null, event: null, eco: null, opening: null, color: "white",
    playerResult: "win", playedAt: NOW - DAY, ...over,
  };
}
function rev(id: string, accuracy: number, at: number, over: Partial<PlayerGame> = {}): PlayerGame {
  return g(id, { userAccuracy: accuracy, reviewedAt: "2026-01-01", playedAt: at, ...over });
}

test("filterGames: default keeps everything including undated", () => {
  const games = [g("a"), g("b", { playedAt: null })];
  assert.equal(filterGames(games, DEFAULT_OVERVIEW_FILTERS, NOW).length, 2);
});

test("filterGames: period drops old and undated games", () => {
  const games = [g("new"), g("old", { playedAt: NOW - 60 * DAY }), g("undated", { playedAt: null })];
  const ids = (preset: "m1" | "m3") =>
    filterGames(games, { ...DEFAULT_OVERVIEW_FILTERS, preset }, NOW).map((x) => x.id);
  assert.deepEqual(ids("m1"), ["new"]);
  assert.deepEqual(ids("m3"), ["new", "old"]);
});

test("filterGames: time class and colour", () => {
  const games = [
    g("a", { timeClass: "blitz", color: "white" }),
    g("b", { timeClass: "rapid", color: "black" }),
    g("c", { timeClass: "blitz", color: "black" }),
  ];
  assert.deepEqual(filterGames(games, { ...DEFAULT_OVERVIEW_FILTERS, timeClass: "blitz" }, NOW).map((x) => x.id), ["a", "c"]);
  assert.deepEqual(filterGames(games, { ...DEFAULT_OVERVIEW_FILTERS, color: "black" }, NOW).map((x) => x.id), ["b", "c"]);
  assert.deepEqual(filterGames(games, { preset: "m1", timeClass: "blitz", color: "black" }, NOW).map((x) => x.id), ["c"]);
});

test("overviewKpis: counts, score with null results, mean accuracy", () => {
  const k = overviewKpis([
    g("1", { playerResult: "win" }),
    g("2", { playerResult: "draw" }),
    g("3", { playerResult: "loss" }),
    g("4", { playerResult: null }),
    rev("5", 80, 1),
    rev("6", 60, 2, { playerResult: "loss" }),
  ]);
  assert.equal(k.games, 6);
  assert.equal(k.reviewed, 2);
  assert.equal(k.avgAccuracy, 70);
  assert.equal(k.wins, 2);
  assert.equal(k.draws, 1);
  assert.equal(k.losses, 2);
  assert.equal(k.scorePct, Math.round((100 * 2.5) / 6));
});

test("overviewKpis: empty", () => {
  const k = overviewKpis([]);
  assert.equal(k.avgAccuracy, null);
  assert.equal(k.scorePct, null);
  assert.equal(k.direction, "flat");
});

function series(first: number, last: number): PlayerGame[] {
  return [
    ...Array.from({ length: 10 }, (_, i) => rev(`a${i}`, first, i)),
    ...Array.from({ length: 10 }, (_, i) => rev(`b${i}`, last, 100 + i)),
  ];
}

test("overviewKpis: trend arrow rules", () => {
  assert.equal(overviewKpis(series(70, 75)).direction, "up");
  assert.equal(overviewKpis(series(75, 70)).direction, "down");
  const flat = overviewKpis(series(70, 70.5));
  assert.equal(flat.direction, "flat");
  assert.equal(flat.insufficientForTrend, false);
  const few = overviewKpis(series(70, 90).slice(0, 19));
  assert.equal(few.direction, "flat");
  assert.equal(few.insufficientForTrend, true);
});
