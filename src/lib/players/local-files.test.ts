import { test } from "node:test";
import assert from "node:assert/strict";
import type { FileDatabase, FileGame } from "@/src/lib/user-files";
import type { PlayerHit } from "@/src/lib/player-types";
import { frequentLocalPlayers, localPlayerGames, localPlayerHits, mergePlayerHits, timeClassFromHeaders } from "./local-files";

const TIME_CASES: Array<[string, { timeControl?: string | null; event?: string | null }, string | null]> = [
  ["60+0 is bullet", { timeControl: "60+0" }, "bullet"],
  ["60+1 is bullet (100s)", { timeControl: "60+1" }, "bullet"],
  ["180 is blitz", { timeControl: "180" }, "blitz"],
  ["179 is bullet", { timeControl: "179" }, "bullet"],
  ["180+2 is blitz (260s)", { timeControl: "180+2" }, "blitz"],
  ["300 is blitz", { timeControl: "300" }, "blitz"],
  ["300+3 is blitz (420s)", { timeControl: "300+3" }, "blitz"],
  ["300+5 is rapid (500s)", { timeControl: "300+5" }, "rapid"],
  ["600+5 is rapid", { timeControl: "600+5" }, "rapid"],
  ["900+10 is rapid (1300s)", { timeControl: "900+10" }, "rapid"],
  ["1500 is classical", { timeControl: "1500" }, "classical"],
  ["40/7200:3600 is classical", { timeControl: "40/7200:3600" }, "classical"],
  ["sandclock *300 is blitz", { timeControl: "*300" }, "blitz"],
  ["dash falls back to nothing", { timeControl: "-" }, null],
  ["question mark falls back to nothing", { timeControl: "?" }, null],
  ["garbage falls back to nothing", { timeControl: "abc" }, null],
  ["0 falls back to nothing", { timeControl: "0" }, null],
  ["missing, no event", {}, null],
  ["dash falls back to the event word", { timeControl: "-", event: "Rated Blitz game" }, "blitz"],
  ["missing uses the event word (case-insensitive)", { event: "Lichess BULLET Arena" }, "bullet"],
  ["rapid in the event", { timeControl: "?", event: "Club rapid" }, "rapid"],
  ["classical in the event", { event: "Classical Championship" }, "classical"],
  ["a readable control wins over the event", { timeControl: "600+0", event: "Blitz night" }, "rapid"],
  ["event without a time word", { event: "World Championship" }, null],
  ["substrings are not words", { event: "Blitzkrieg Open" }, null],
];

for (const [name, input, expected] of TIME_CASES) {
  test(`timeClassFromHeaders: ${name}`, () => {
    assert.equal(timeClassFromHeaders(input), expected);
  });
}

function pgn(tags: Record<string, string>, moves = "1. e4 e5 2. Nf3 Nc6 1-0"): string {
  const head = Object.entries(tags).map(([k, v]) => `[${k} "${v}"]`).join("\n");
  return `${head}\n\n${moves}\n`;
}

let counter = 0;
function game(white: string, black: string, extra: Record<string, string> = {}): FileGame {
  counter += 1;
  const tags = { Event: "Club", Date: "2024.03.05", Result: "1-0", White: white, Black: black, ...extra };
  return {
    id: `g${counter}`,
    white,
    black,
    result: tags.Result,
    event: tags.Event,
    date: tags.Date,
    pgn: pgn(tags),
    title: `${white} - ${black}`,
  };
}

function db(id: string, games: FileGame[]): FileDatabase {
  return { id, remoteId: null, name: id, folderId: null, games };
}

test("localPlayerGames maps color, result, ratings, date and time class", () => {
  const asWhite = game("Carlsen, Magnus", "Nepo", {
    WhiteElo: "2830",
    BlackElo: "2770",
    ECO: "C44",
    Opening: "Scotch",
    TimeControl: "600+5",
  });
  const asBlack = game("Hikaru", "Carlsen, Magnus", { Result: "1/2-1/2", Date: "2023.11.??", Event: "Rated Blitz game" });
  const loss = game("Other", "Carlsen, Magnus", { Result: "1-0", Date: "????.??.??" });
  const unrelated = game("A", "B");
  const games = localPlayerGames([db("a", [asWhite, unrelated]), db("b", [asBlack, loss])], "Carlsen, Magnus");
  assert.equal(games.length, 3);

  const [first, second, third] = games;
  assert.equal(first.id, asWhite.id);
  assert.equal(first.color, "white");
  assert.equal(first.playerResult, "win");
  assert.equal(first.winner, "white");
  assert.equal(first.whiteRating, 2830);
  assert.equal(first.blackRating, 2770);
  assert.equal(first.eco, "C44");
  assert.equal(first.opening, "Scotch");
  assert.equal(first.event, "Club");
  assert.equal(first.year, 2024);
  assert.equal(first.month, 3);
  assert.equal(first.playedAt, Date.UTC(2024, 2, 5));
  assert.equal(first.timeClass, "rapid");
  assert.equal(first.moves, "e4 e5 Nf3 Nc6");
  assert.equal(first.pgn, asWhite.pgn);

  assert.equal(second.color, "black");
  assert.equal(second.playerResult, "draw");
  assert.equal(second.winner, "draw");
  assert.equal(second.year, 2023);
  assert.equal(second.month, 11);
  assert.equal(second.playedAt, Date.UTC(2023, 10, 1), "missing day defaults to the 1st");
  assert.equal(second.timeClass, "blitz", "falls back to the Event word");
  assert.equal(second.whiteRating, null);

  assert.equal(third.color, "black");
  assert.equal(third.playerResult, "loss");
  assert.equal(third.year, null);
  assert.equal(third.playedAt, null);
  assert.equal(third.timeClass, null);
});

test("localPlayerGames matches names ignoring case and surrounding spaces, exactly otherwise", () => {
  const databases = [db("a", [game(" magnus carlsen ", "X"), game("Magnus Carlsen Jr", "Y"), game("Z", "MAGNUS CARLSEN")])];
  assert.equal(localPlayerGames(databases, "Magnus Carlsen").length, 2);
  assert.equal(localPlayerGames(databases, "  magnus carlsen  ").length, 2);
  assert.equal(localPlayerGames(databases, "Magnus").length, 0);
  assert.equal(localPlayerGames(databases, "   ").length, 0);
});

test("localPlayerGames is not capped at 200 and caches per game", () => {
  const many = Array.from({ length: 450 }, (_, index) => game("Busy", `Opp${index}`));
  const databases = [db("a", many)];
  const first = localPlayerGames(databases, "Busy");
  assert.equal(first.length, 450);
  const second = localPlayerGames(databases, "busy");
  assert.equal(second[0], first[0], "same object from the WeakMap cache");
});

test("localPlayerHits finds each name once, case-insensitive, with the studio shape", () => {
  const databases = [
    db("a", [game("Carlsen, Magnus", "Nakamura, Hikaru"), game("carlsen, magnus", "Caruana")]),
    db("b", [game("Carlsen, Magnus", "?")]),
  ];
  const hits = localPlayerHits(databases, " CARLS ");
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0], {
    id: "studio:Carlsen, Magnus",
    source: "studio",
    username: "Carlsen, Magnus",
    displayName: "Carlsen, Magnus",
    subtitle: "Studio database",
    inDatabases: true,
  });
  assert.deepEqual(localPlayerHits(databases, "ca").map((hit) => hit.username).sort(), [
    "Carlsen, Magnus",
    "Caruana",
  ]);
  assert.deepEqual(localPlayerHits(databases, "zzz"), []);
  assert.deepEqual(localPlayerHits(databases, "  "), []);
});

test("mergePlayerHits shows a studio player found both ways once, keeping online hits", () => {
  const local: PlayerHit[] = [
    { id: "studio:Carlsen", source: "studio", username: "Carlsen", displayName: "Carlsen", subtitle: "Studio database", inDatabases: true },
    { id: "studio:Local Only", source: "studio", username: "Local Only", displayName: "Local Only", subtitle: "Studio database", inDatabases: true },
  ];
  const server: PlayerHit[] = [
    { id: "lichess:carlsen", source: "lichess", username: "carlsen", displayName: "carlsen", subtitle: "2800" },
    { id: "studio:carlsen", source: "studio", username: "carlsen", displayName: "Magnus Carlsen", subtitle: "Sample book" },
    { id: "studio:CARLSEN", source: "studio", username: "CARLSEN", displayName: "dup", subtitle: "x", inDatabases: true },
  ];
  const merged = mergePlayerHits(local, server);
  assert.deepEqual(merged.map((hit) => hit.id), ["lichess:carlsen", "studio:carlsen", "studio:Local Only"]);
  assert.equal(merged[1].displayName, "Magnus Carlsen");
  assert.equal(merged[1].inDatabases, true);
  assert.equal(merged[0].inDatabases, undefined);
  assert.equal(mergePlayerHits([], server), server);
});

test("frequentLocalPlayers ranks names by games across databases without parsing PGNs", () => {
  const databases = [
    db("a", [game("Carlsen, Magnus", "Nakamura, Hikaru"), game("carlsen, magnus", "Caruana")]),
    db("b", [game("Caruana", "?"), game("Carlsen, Magnus", "Ding")]),
  ];
  const { top, names } = frequentLocalPlayers(databases, 2);
  assert.deepEqual(
    top.map((hit) => hit.username),
    ["Carlsen, Magnus", "Caruana"],
  );
  assert.equal(top[0]!.inDatabases, true);
  assert.deepEqual([...names].sort(), ["carlsen, magnus", "caruana", "ding", "nakamura, hikaru"]);
});
