import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types.ts";
import type { FileDatabase } from "@/src/lib/user-files.ts";
import { createFileSource, fileDatabaseOverview } from "./file-source.ts";
import { createMyGamesSource } from "./my-games-source.ts";
import {
  averageElo,
  mergeOverviews,
  overviewFromItems,
  topEco,
  topPlayers,
  yearBuckets,
  type OverviewRow,
} from "./overview.ts";

const signal = new AbortController().signal;
const row = (o: Partial<OverviewRow> = {}): OverviewRow => ({
  white: "A", black: "B", whiteElo: null, blackElo: null, eco: null, opening: null, result: "*", date: null, ...o,
});

describe("overview helpers", () => {
  it("counts games, distinct players (trim + case-fold), ignoring '?'", () => {
    const o = overviewFromItems([row({ white: "Carlsen", black: " nepo " }), row({ white: "CARLSEN", black: "?" })]);
    assert.equal(o.games, 2);
    assert.equal(o.players.size, 2);
  });
  it("averages known ratings only, rounded; null when none", () => {
    const o = overviewFromItems([row({ whiteElo: 2000, blackElo: null }), row({ whiteElo: 2001, blackElo: 0 })]);
    assert.equal(o.eloCount, 2);
    assert.equal(averageElo(o), 2001); // 2000.5 rounds up
    assert.equal(averageElo(overviewFromItems([row()])), null);
  });
  it("merges sources: shared players once, counts and elo summed", () => {
    const a = overviewFromItems([row({ white: "Magnus", black: "X", whiteElo: 2800, eco: "B01", opening: "Scandi" })]);
    const b = overviewFromItems([row({ white: "magnus", black: "Y", whiteElo: 2600, eco: "b01" })]);
    const m = mergeOverviews([a, b]);
    assert.equal(m.games, 2);
    assert.equal(m.players.size, 3);
    assert.equal(averageElo(m), 2700);
    assert.deepEqual(topEco(m, 3), [{ code: "B01", count: 2, opening: "Scandi" }]);
    assert.equal(a.eco.get("B01")?.count, 1); // inputs untouched
  });
  it("top ECO: most frequent first, ties by code ascending, limited to n", () => {
    const o = overviewFromItems([
      ...["C65", "C65", "B01", "A00", "D00", "D00"].map((eco) => row({ eco })),
      row({ eco: null }),
    ]);
    assert.deepEqual(topEco(o, 3).map((e) => e.code), ["C65", "D00", "A00"]);
  });
  it("labels each code with its most frequent opening in either game order", () => {
    const games = ["Richter-Veresov Attack", "Rapport-Jobava System", " Rapport-Jobava System ", "Richter-Veresov Attack", "Rapport-Jobava System"]
      .map((opening) => row({ eco: "D01", opening }));
    const expected = [{ code: "D01", count: 5, opening: "Rapport-Jobava System" }];
    assert.deepEqual(topEco(overviewFromItems(games), 3), expected);
    assert.deepEqual(topEco(overviewFromItems([...games].reverse()), 3), expected);
  });
  it("breaks opening name ties by length and then alphabetically in either game order", () => {
    const games = ["Alpha", "Zulu", "Beta"].map((opening) => row({ eco: "D01", opening }));
    const expected = [{ code: "D01", count: 3, opening: "Beta" }];
    assert.deepEqual(topEco(overviewFromItems(games), 3), expected);
    assert.deepEqual(topEco(overviewFromItems([...games].reverse()), 3), expected);
  });
  it("counts unnamed games in the bar total and excludes them from label selection", () => {
    const games = [null, "", "  ", "?", " ? "].flatMap((opening) => [
      row({ eco: "D01", opening }),
      row({ eco: "D02", opening }),
    ]);
    games.push(row({ eco: "D01", opening: "Rapport-Jobava System" }));
    assert.deepEqual(topEco(overviewFromItems(games), 3), [
      { code: "D01", count: 6, opening: "Rapport-Jobava System" },
      { code: "D02", count: 5, opening: null },
    ]);
  });
  it("merges all opening name counts, including names that did not win in either source", () => {
    const a = overviewFromItems(["Veresov", "Veresov", "Veresov", "Jobava", "Jobava"]
      .map((opening) => row({ eco: "D01", opening })));
    const b = overviewFromItems(["Attack", "Attack", "Attack", "Jobava", "Jobava"]
      .map((opening) => row({ eco: "D01", opening })));
    const expected = [{ code: "D01", count: 10, opening: "Jobava" }];
    assert.deepEqual(topEco(mergeOverviews([a, b]), 3), expected);
    assert.deepEqual(topEco(mergeOverviews([b, a]), 3), expected);
    assert.deepEqual(topEco(a, 3), [{ code: "D01", count: 5, opening: "Veresov" }]);
    assert.deepEqual(topEco(b, 3), [{ code: "D01", count: 5, opening: "Attack" }]);
  });
});

describe("overview results, years and players (SIG-1332)", () => {
  it("counts results from White's point of view; anything else is unfinished", () => {
    const o = overviewFromItems(
      (["1-0", "1-0", "0-1", "1/2-1/2", "*"] as const).map((result) => row({ result })),
    );
    assert.deepEqual(o.results, { white: 2, draws: 1, black: 1, other: 1 });
  });
  it("counts games per year (yyyy, yyyy-mm, yyyy-mm-dd), skipping undated games", () => {
    const o = overviewFromItems([
      row({ date: "2020" }), row({ date: "2020-05" }), row({ date: "2019-12-31" }), row({ date: null }), row({ date: "??" }),
    ]);
    assert.equal(o.games, 5);
    assert.deepEqual(yearBuckets(o), [{ year: 2019, count: 1 }, { year: 2020, count: 2 }]);
    assert.deepEqual(yearBuckets(overviewFromItems([row()])), []);
  });
  it("counts games per player under the normalized key, keeping the first display name; ignores '?'", () => {
    const o = overviewFromItems([
      row({ white: "Carlsen, M.", black: "?" }),
      row({ white: " nepo ", black: "carlsen, m." }),
      row({ white: "", black: "NEPO" }),
    ]);
    assert.equal(o.players.size, 2);
    assert.equal(o.playerGames.size, o.players.size);
    assert.deepEqual(topPlayers(o, 5), [
      { name: "Carlsen, M.", games: 2 },
      { name: "nepo", games: 2 },
    ]);
  });
  it("a player present in two sources is one player with the summed count", () => {
    const a = overviewFromItems([row({ white: "Magnus", black: "X", result: "1-0", date: "2020" })]);
    const b = overviewFromItems([row({ white: "magnus", black: "Y", result: "0-1", date: "2020" }), row({ white: "Z", black: "MAGNUS" })]);
    const m = mergeOverviews([a, b]);
    assert.deepEqual(m.results, { white: 1, draws: 0, black: 1, other: 1 });
    assert.deepEqual(yearBuckets(m), [{ year: 2020, count: 2 }]);
    assert.equal(m.playerGames.size, m.players.size);
    assert.deepEqual(topPlayers(m, 1), [{ name: "Magnus", games: 3 }]);
    // inputs untouched
    assert.equal(a.playerGames.get("magnus")?.games, 1);
    assert.deepEqual(a.results, { white: 1, draws: 0, black: 0, other: 0 });
    assert.equal(a.years.get(2020), 1);
  });
  it("top players: most games first, ties by name ascending, limited to n", () => {
    const o = overviewFromItems([
      row({ white: "Zed", black: "Bob" }), row({ white: "Zed", black: "Amy" }), row({ white: "Cat", black: "Bob" }),
    ]);
    assert.deepEqual(topPlayers(o, 3), [
      { name: "Bob", games: 2 },
      { name: "Zed", games: 2 },
      { name: "Amy", games: 1 },
    ]);
    assert.equal(topPlayers(o, 1).length, 1);
    assert.deepEqual(topPlayers(overviewFromItems([]), 5), []);
  });
});

const db: FileDatabase = {
  id: "d1", remoteId: null, name: "Study", folderId: null,
  games: [
    { id: "g1", white: "Carlsen", black: "Nepo", result: "1-0", event: "", date: "", title: "", pgn: '[White "Carlsen"]\n[Black "Nepo"]\n[Date "2021.07.05"]\n[Result "1-0"]\n[WhiteElo "2850"]\n[ECO "C44"]\n[Opening "Scotch"]\n\n1. e4 e5 1-0' },
    { id: "g2", white: "Nepo", black: "Anand", result: "*", event: "", date: "", title: "", pgn: '[White "Nepo"]\n[Black "Anand"]\n\n1. d4 *' },
  ],
};

describe("file source overview", () => {
  it("summarizes in memory and caches per games array", async () => {
    const src = createFileSource("d1", () => db);
    const o = await src.overview!(signal);
    assert.equal(o.games, 2);
    assert.equal(o.players.size, 3);
    assert.equal(averageElo(o), 2850);
    assert.deepEqual(topEco(o, 3), [{ code: "C44", count: 1, opening: "Scotch" }]);
    assert.deepEqual(o.results, { white: 1, draws: 0, black: 0, other: 1 });
    assert.deepEqual(yearBuckets(o), [{ year: 2021, count: 1 }]);
    assert.deepEqual(topPlayers(o, 1), [{ name: "Nepo", games: 2 }]);
    assert.equal(fileDatabaseOverview(db), o);
    // Rename/move rebuild the wrapper but keep the games array: cache hit.
    assert.equal(fileDatabaseOverview({ ...db, name: "renamed" }), o);
    // New games (import, replace, merge): recomputed.
    assert.notEqual(fileDatabaseOverview({ ...db, games: [...db.games] }), o);
  });
});

function pagedClient(rows: Record<string, unknown>[], error: { message: string } | null = null) {
  const ranges: [number, number][] = [];
  let pending: [number, number] = [0, 0];
  const q: Record<string, unknown> = {};
  q.order = () => q;
  q.range = (from: number, to: number) => { pending = [from, to]; ranges.push(pending); return q; };
  q.abortSignal = () =>
    Promise.resolve({ data: error ? null : rows.slice(pending[0], pending[1] + 1), error });
  const selects: string[] = [];
  const client = { from: () => ({ select: (cols: string) => { selects.push(cols); return q; } }) };
  return { client: client as unknown as SupabaseClient<Database>, ranges, selects };
}

describe("my games overview", () => {
  it("pages in chunks of 1000 and aggregates on the client", async () => {
    const rows = Array.from({ length: 2300 }, (_, i) => ({
      white: `P${i % 10}`, black: "Me", white_elo: 1000, black_elo: i % 2 ? 2000 : null, eco: i < 5 ? "B01" : "A00", opening: null,
      color: i % 2 ? "black" : "white", result: i % 4 === 0 ? "win" : i % 4 === 1 ? "loss" : i % 4 === 2 ? "draw" : null,
      played_at: i < 2000 ? "2023-04-01T10:00:00Z" : null,
    }));
    const { client, ranges, selects } = pagedClient(rows);
    const o = await createMyGamesSource(() => client).overview!(signal);
    assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
    assert.equal(selects[0], "white, black, white_elo, black_elo, eco, opening, color, result, played_at");
    assert.equal(o.games, 2300);
    assert.equal(o.players.size, 11);
    assert.equal(o.eloCount, 2300 + 1150);
    assert.equal(topEco(o, 1)[0].code, "A00");
    // i%4: 0 win as white (1-0), 1 loss as black (1-0), 2 draw, 3 unfinished.
    assert.deepEqual(o.results, { white: 1150, draws: 575, black: 0, other: 575 });
    assert.deepEqual(yearBuckets(o), [{ year: 2023, count: 2000 }]);
    assert.deepEqual(topPlayers(o, 1), [{ name: "Me", games: 2300 }]);
  });
  it("stops after an exact-multiple page followed by an empty one", async () => {
    const rows = Array.from({ length: 1000 }, () => ({ white: "a", black: "b", white_elo: null, black_elo: null, eco: null, opening: null }));
    const { client, ranges } = pagedClient(rows);
    const o = await createMyGamesSource(() => client).overview!(signal);
    assert.equal(o.games, 1000);
    assert.equal(ranges.length, 2);
  });
  it("throws on query errors and when aborted", async () => {
    await assert.rejects(createMyGamesSource(() => pagedClient([], { message: "boom" }).client).overview!(signal), /boom/);
    const c = new AbortController();
    c.abort();
    await assert.rejects(createMyGamesSource(() => pagedClient([]).client).overview!(c.signal));
  });
});
