import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types.ts";
import type { FileDatabase } from "@/src/lib/user-files.ts";
import { createFileSource, fileDatabaseOverview } from "./file-source.ts";
import { createMyGamesSource } from "./my-games-source.ts";
import { averageElo, mergeOverviews, overviewFromItems, topEco, type OverviewRow } from "./overview.ts";

const signal = new AbortController().signal;
const row = (o: Partial<OverviewRow> = {}): OverviewRow => ({
  white: "A", black: "B", whiteElo: null, blackElo: null, eco: null, opening: null, ...o,
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
});

const db: FileDatabase = {
  id: "d1", remoteId: null, name: "Study", folderId: null,
  games: [
    { id: "g1", white: "Carlsen", black: "Nepo", result: "1-0", event: "", date: "", title: "", pgn: '[White "Carlsen"]\n[Black "Nepo"]\n[WhiteElo "2850"]\n[ECO "C44"]\n[Opening "Scotch"]\n\n1. e4 e5 1-0' },
    { id: "g2", white: "Nepo", black: "Anand", result: "*", event: "", date: "", title: "", pgn: '[White "Nepo"]\n[Black "Anand"]\n\n1. d4 *' },
  ],
};

describe("file source overview", () => {
  it("summarizes in memory and caches per database object", async () => {
    const src = createFileSource("d1", () => db);
    const o = await src.overview!(signal);
    assert.equal(o.games, 2);
    assert.equal(o.players.size, 3);
    assert.equal(averageElo(o), 2850);
    assert.deepEqual(topEco(o, 3), [{ code: "C44", count: 1, opening: "Scotch" }]);
    assert.equal(fileDatabaseOverview(db), o);
    assert.notEqual(fileDatabaseOverview({ ...db }), o);
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
    }));
    const { client, ranges, selects } = pagedClient(rows);
    const o = await createMyGamesSource(() => client).overview!(signal);
    assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
    assert.equal(selects[0], "white, black, white_elo, black_elo, eco, opening");
    assert.equal(o.games, 2300);
    assert.equal(o.players.size, 11);
    assert.equal(o.eloCount, 2300 + 1150);
    assert.equal(topEco(o, 1)[0].code, "A00");
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
