import assert from "node:assert/strict";
import { test } from "node:test";
import type { LiveGame } from "../../lib/live/types.ts";
import {
  countGames,
  filterGames,
  isTypingTarget,
  normalizeSearch,
  searchGames,
  shortPlayerName,
  sortGames,
  topRating,
} from "./live-games-filter.ts";

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

// SIG-1311

const p = (name: string, rating: number | null = null) => ({ name, rating, clockMs: null });
const pg = (id: string, white: ReturnType<typeof p>, black: ReturnType<typeof p>, result: LiveGame["result"] = "*") =>
  ({ id, result, white, black }) as unknown as LiveGame;
const players = [
  pg("a", p("Sevian, Samuel", 2650), p("Carlsen, Magnus", 2830)),
  pg("b", p("Pérez, José", 2500), p("Nobody", null)),
  pg("c", p("Una"), p("Uno")),
  pg("d", p("Low", 2400), p("Tie", 2830)),
  pg("e", p("Solo", 2830), p("Other")),
];

test("normalizeSearch: lowercase, accent-free", () => {
  assert.equal(normalizeSearch("José Ñandú"), "jose nandu");
  assert.equal(normalizeSearch("SEVIAN"), "sevian");
});

test("searchGames: White or Black, case and accent-insensitive, blank keeps all, never mutates", () => {
  const ids = (q: string) => searchGames(players, q).map((g) => g.id);
  assert.deepEqual(ids("sevian"), ["a"]);
  assert.deepEqual(ids("MAGNUS"), ["a"]);
  assert.deepEqual(ids("jose"), ["b"]);
  assert.deepEqual(ids("PÉREZ"), ["b"]);
  assert.deepEqual(ids("zzz"), []);
  assert.deepEqual(ids(""), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(ids("   "), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(ids("un"), ["c"]);
  assert.equal(players.length, 5);
});

test("topRating: the higher rating, null when neither has one", () => {
  assert.equal(topRating(players[0]!), 2830);
  assert.equal(topRating(players[1]!), 2500);
  assert.equal(topRating(players[2]!), null);
});

test("sortGames: board keeps the order; rating is highest first, unrated last, ties keep board order", () => {
  assert.deepEqual(sortGames(players, "board").map((g) => g.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(sortGames(players, "rating").map((g) => g.id), ["a", "d", "e", "b", "c"]);
  assert.deepEqual(sortGames([], "rating"), []);
  assert.deepEqual(sortGames([players[2]!, players[1]!], "rating").map((g) => g.id), ["b", "c"]);
});

test("search, status filter and sort combine in any order of application", () => {
  const rows = [
    pg("a", p("Anna Low", 2400), p("Z", 2100)),
    pg("b", p("Anna High", 2700), p("Y", 2100), "1-0"),
    pg("c", p("Anna Mid", 2500), p("X", 2100)),
    pg("d", p("Other", 2800), p("W", 2100)),
  ];
  const searched = searchGames(rows, "anna");
  assert.deepEqual(countGames(searched), { all: 3, ongoing: 2, finished: 1 });
  assert.deepEqual(sortGames(filterGames(searched, "ongoing"), "rating").map((g) => g.id), ["c", "a"]);
});

test("shortPlayerName: 'Surname, Firstname' becomes 'F. Surname'", () => {
  assert.equal(shortPlayerName("Vachier-Lagrave, Maxime"), "M. Vachier-Lagrave");
  assert.equal(shortPlayerName("Sevian, Samuel"), "S. Sevian");
  assert.equal(shortPlayerName("Nakamura,Hikaru"), "H. Nakamura");
  assert.equal(shortPlayerName("Álvarez, émile"), "É. Álvarez");
  assert.equal(shortPlayerName("Smith, John, Jr."), "J. Smith");
});

test("shortPlayerName: no comma is unchanged; degenerate commas do not break", () => {
  assert.equal(shortPlayerName("Magnus Carlsen"), "Magnus Carlsen");
  assert.equal(shortPlayerName("Carlsen"), "Carlsen");
  assert.equal(shortPlayerName(""), "");
  assert.equal(shortPlayerName("Carlsen,"), "Carlsen");
  assert.equal(shortPlayerName(", Magnus"), ", Magnus");
});

test("isTypingTarget: inputs, textareas, selects and editable content only", () => {
  assert.equal(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget), true);
  assert.equal(isTypingTarget({ tagName: "textarea" } as unknown as EventTarget), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" } as unknown as EventTarget), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(isTypingTarget({ tagName: "DIV" } as unknown as EventTarget), false);
  assert.equal(isTypingTarget(null), false);
});
