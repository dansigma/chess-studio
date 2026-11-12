import assert from "node:assert/strict";
import { test } from "node:test";
import type { LiveGame } from "../../lib/live/types.ts";
import { countGames, filterGames } from "./live-games-filter.ts";

const g = (id: string, result: LiveGame["result"], clockMs: number | null = null) =>
  ({ id, result, white: { clockMs }, black: { clockMs } }) as unknown as LiveGame;
const rows = [g("a", "*"), g("b", "1-0"), g("c", "*", 1000), g("d", "1/2-1/2"), g("e", "0-1")];

test("filterGames: all keeps everything, ongoing is result * (clock-independent), finished is the rest", () => {
  assert.deepEqual(filterGames(rows, "all").map((r) => r.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(filterGames(rows, "ongoing").map((r) => r.id), ["a", "c"]);
  assert.deepEqual(filterGames(rows, "finished").map((r) => r.id), ["b", "d", "e"]);
  assert.deepEqual(filterGames([], "ongoing"), []);
});

test("countGames", () => {
  assert.deepEqual(countGames(rows), { all: 5, ongoing: 2, finished: 3 });
  assert.deepEqual(countGames([]), { all: 0, ongoing: 0, finished: 0 });
});
