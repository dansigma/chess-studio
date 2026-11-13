import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types.ts";
import type { FileDatabase } from "@/src/lib/user-files.ts";
import {
  annotationInfo, hasCommentText, matchesAdvancedFilters, matchesAnnotations, matchesEco, matchesEloRange,
  matchesPlayer, matchesYearRange, normalizePgnDate,
} from "./filters.ts";
import { createFileSource, suggestPlayersFromDatabases, syncFileSources } from "./file-source.ts";
import { createMyGamesSource, ilikeValue, myGamesPositionKey, myGamesRowToItem } from "./my-games-source.ts";
import { decodeLibraryCursor, queryLibrary } from "./query.ts";
import { compareLibraryItems } from "./sort.ts";
import { clearLibrarySources, getLibrarySource, listLibrarySources, registerLibrarySource } from "./sources.ts";
import {
  DEFAULT_LIBRARY_FILTERS,
  type LibraryFilterState,
  type LibraryGameItem,
  type LibrarySourceAdapter,
} from "./types.ts";

const signal = new AbortController().signal;

function item(sourceId: LibraryGameItem["sourceId"], id: string, o: Partial<LibraryGameItem> = {}): LibraryGameItem {
  return {
    key: `${sourceId}:${id}`, sourceId, gameId: id, white: "W", whiteElo: null, black: "B", blackElo: null,
    result: "*", eco: null, opening: null, plyCount: null, event: null, date: null, ...o,
  };
}

function filters(o: Partial<LibraryFilterState> = {}): LibraryFilterState {
  return { ...DEFAULT_LIBRARY_FILTERS, ...o };
}

function fakeSource(id: LibrarySourceAdapterId, items: LibraryGameItem[]): LibrarySourceAdapter {
  return {
    id,
    label: () => id,
    capabilities: () => ({ textSearch: "full", color: "full", result: "full", annotations: "full", position: "full", player: "full", eloRange: "full", eco: "full", date: "full", sort: "full", maxResults: null }),
    async list(f, cursor, limit) {
      const sorted = [...items].sort((a, b) => compareLibraryItems(f.sort, a, b));
      const offset = Number(cursor ?? 0);
      const page = sorted.slice(offset, offset + limit);
      return { items: page, nextCursor: offset + page.length < sorted.length ? String(offset + page.length) : null, total: sorted.length };
    },
    async loadPgn() { return ""; },
  };
}
type LibrarySourceAdapterId = LibrarySourceAdapter["id"];

describe("sorting", () => {
  const asc = { key: "whiteElo", direction: "asc" } as const;
  const desc = { key: "whiteElo", direction: "desc" } as const;
  const a = item("my-games", "a", { whiteElo: 2000 });
  const b = item("my-games", "b", { whiteElo: 2500 });
  const n = item("my-games", "n", { whiteElo: null });
  it("puts nulls last in both directions", () => {
    assert.deepEqual([n, b, a].sort((x, y) => compareLibraryItems(asc, x, y)).map((i) => i.gameId), ["a", "b", "n"]);
    assert.deepEqual([n, a, b].sort((x, y) => compareLibraryItems(desc, x, y)).map((i) => i.gameId), ["b", "a", "n"]);
  });
  it("breaks ties by key and compares names case-insensitively", () => {
    const x = item("my-games", "2", { white: "anna" });
    const y = item("my-games", "1", { white: "Anna" });
    assert.deepEqual([x, y].sort((p, q) => compareLibraryItems({ key: "white", direction: "asc" }, p, q)).map((i) => i.gameId), ["1", "2"]);
  });
  it("orders results 1-0, draw, 0-1, *", () => {
    const rs = (["*", "0-1", "1/2-1/2", "1-0"] as const).map((r) => item("my-games", r, { result: r }));
    assert.deepEqual(rs.sort((p, q) => compareLibraryItems({ key: "result", direction: "asc" }, p, q)).map((i) => i.result), ["1-0", "1/2-1/2", "0-1", "*"]);
  });
});

describe("annotations", () => {
  const tree = (nodes: object[]) => ({ startFen: "", children: nodes as never });
  const node = (extra: object = {}, children: object[] = []) => ({ id: "x", san: "e4", uci: "e2e4", fen: "", from: "", to: "", children, ...extra });
  it("ignores command-only comments", () => {
    assert.equal(hasCommentText("[%clk 0:01:00]"), false);
    assert.equal(hasCommentText("[%eval 0.3] [%clk 0:01:00]"), false);
    assert.equal(hasCommentText("[%clk 0:01:00] good move"), true);
  });
  it("distinguishes commented, annotated and plain", () => {
    const plain = annotationInfo(tree([node({ comment: "[%clk 0:00:10]" })]));
    assert.deepEqual(plain, { commented: false, annotated: false });
    const nag = annotationInfo(tree([node({ nags: [1] })]));
    assert.deepEqual(nag, { commented: false, annotated: true });
    const variation = annotationInfo(tree([node(), node()]));
    assert.equal(variation.annotated, true);
    const text = annotationInfo(tree([node({}, [node({ comment: "hi" })])]));
    assert.equal(matchesAnnotations(text, "commented"), true);
    assert.equal(matchesAnnotations(nag, "commented"), false);
    assert.equal(matchesAnnotations(nag, "annotated"), true);
  });
  it("normalizes PGN dates", () => {
    assert.equal(normalizePgnDate("1992.11.04"), "1992-11-04");
    assert.equal(normalizePgnDate("1992.11.??"), "1992-11");
    assert.equal(normalizePgnDate("1992.??.??"), "1992");
    assert.equal(normalizePgnDate("????.??.??"), null);
  });
});

const pgn = (white: string, black: string, result: string, body: string, extra = "") =>
  `[Event "Open"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n[Date "2020.05.01"]\n${extra}\n${body} ${result}`;

const db: FileDatabase = {
  id: "d1", remoteId: null, name: "Study", folderId: null,
  games: [
    { id: "g1", white: "Carlsen", black: "Nepo", result: "1-0", event: "Open", date: "2020.05.01", title: "", pgn: pgn("Carlsen", "Nepo", "1-0", "1. e4 e5 2. Nf3 {nice} Nc6", '[WhiteElo "2850"]\n[ECO "C44"]') },
    { id: "g2", white: "Nepo", black: "Firouzja", result: "0-1", event: "Open", date: "2019.01.01", title: "", pgn: pgn("Nepo", "Firouzja", "0-1", "1. d4 d5") },
    { id: "g3", white: "Anand", black: "Carlsen", result: "1/2-1/2", event: "Open", date: "????.??.??", title: "", pgn: pgn("Anand", "Carlsen", "1/2-1/2", "1. c4 e5 {[%clk 0:01:00]}") },
  ],
};

describe("file source", () => {
  const src = createFileSource("d1", () => db);
  it("filters, sorts and paginates in memory", async () => {
    const all = await src.list(filters({ sources: ["file:d1"], sort: { key: "date", direction: "desc" } }), null, 2, signal);
    assert.deepEqual(all.items.map((i) => i.gameId), ["g1", "g2"]);
    assert.equal(all.total, 3);
    assert.equal(all.nextCursor, "2");
    const rest = await src.list(filters({ sources: ["file:d1"] }), all.nextCursor, 2, signal);
    assert.deepEqual(rest.items.map((i) => i.gameId), ["g3"]); // null date last
    assert.equal(rest.nextCursor, null);
  });
  it("maps header data", async () => {
    const page = await src.list(filters({ query: "carlsen nepo" }), null, 10, signal);
    assert.equal(page.items.length, 1);
    assert.deepEqual([page.items[0].whiteElo, page.items[0].eco, page.items[0].plyCount, page.items[0].date], [2850, "C44", 4, "2020-05-01"]);
  });
  it("applies opponent with color, result and annotations", async () => {
    const opp = (color: LibraryFilterState["color"]) => src.list(filters({ opponent: "carlsen", color }), null, 10, signal).then((p) => p.items.map((i) => i.gameId).sort());
    assert.deepEqual(await opp("both"), ["g1", "g3"]);
    assert.deepEqual(await opp("white"), ["g3"]); // opponent is Black
    assert.deepEqual(await opp("black"), ["g1"]);
    const draws = await src.list(filters({ result: "draw" }), null, 10, signal);
    assert.deepEqual(draws.items.map((i) => i.gameId), ["g3"]);
    const commented = await src.list(filters({ annotations: "commented" }), null, 10, signal);
    assert.deepEqual(commented.items.map((i) => i.gameId), ["g1"]);
  });
  it("filters by position", async () => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    const page = await src.list(filters({ position: { fen } }), null, 10, signal);
    assert.deepEqual(page.items.map((i) => i.gameId), ["g1"]);
  });
  it("loads pgn", async () => {
    assert.equal(await src.loadPgn("g2", signal), db.games[1].pgn);
    await assert.rejects(src.loadPgn("nope", signal));
  });
  it("syncFileSources registers and drops adapters", () => {
    clearLibrarySources();
    syncFileSources([db]);
    assert.equal(listLibrarySources().length, 1);
    syncFileSources([]);
    assert.equal(getLibrarySource("file:d1"), undefined);
  });
});

type Call = [string, ...unknown[]];
function fakeClient(rows: Record<string, unknown>[], count = rows.length, error: { message: string } | null = null) {
  const calls: Call[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["or", "ilike", "eq", "order", "gte", "lt", "not"]) {
    q[m] = (...args: unknown[]) => { calls.push([m, ...args]); return q; };
  }
  q.range = (...args: unknown[]) => { calls.push(["range", ...args]); return q; };
  q.abortSignal = () => Promise.resolve({ data: error ? null : rows, error, count });
  q.single = () => Promise.resolve({ data: rows[0], error: null });
  const client = { from: () => ({ select: (...args: unknown[]) => { calls.push(["select", ...args]); return q; } }) };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}
const row = (o: Record<string, unknown> = {}) => ({
  id: "r1", source: "lichess", played_at: "2026-10-20T12:00:00.000Z", color: "black", result: "win",
  time_class: "blitz", white: "Hikaru", black: "Me", white_elo: 2700, black_elo: null, eco: "B01", opening: "Scandi", ply_count: 0, ...o,
});

describe("my games source", () => {
  it("maps rows", () => {
    const i = myGamesRowToItem(row() as never);
    assert.equal(i.result, "0-1");
    assert.equal(i.event, "Lichess · Blitz");
    assert.equal(i.date, "2026-10-20");
    assert.equal(i.plyCount, null);
    assert.equal(myGamesRowToItem(row({ color: "white", result: "loss" }) as never).result, "0-1");
    assert.equal(myGamesRowToItem(row({ result: null }) as never).result, "*");
  });
  it("escapes like wildcards", () => {
    assert.equal(ilikeValue("a%b_c"), '"%a\\\\%b\\\\_c%"');
  });
  it("builds a server-side query", async () => {
    const { client, calls } = fakeClient([row()], 120);
    const src = createMyGamesSource(() => client);
    const page = await src.list(filters({ query: "scandi", opponent: "hik", color: "black", result: "0-1", sort: { key: "whiteElo", direction: "desc" } }), "50", 50, signal);
    assert.deepEqual(calls.find((c) => c[0] === "range"), ["range", 50, 99]);
    assert.ok(calls.some((c) => c[0] === "eq" && c[1] === "color" && c[2] === "black"));
    assert.ok(calls.some((c) => c[0] === "ilike" && c[1] === "white" && c[2] === "%hik%"));
    assert.ok(calls.some((c) => c[0] === "or" && String(c[1]).includes("and(color.eq.black,result.eq.win)")));
    assert.deepEqual(calls.find((c) => c[0] === "order"), ["order", "white_elo", { ascending: false, nullsFirst: false }]);
    assert.equal(page.total, 120);
    assert.equal(page.nextCursor, "51");
  });
  it("adds player, ECO and period clauses", async () => {
    const { client, calls } = fakeClient([row()], 5);
    await createMyGamesSource(() => client).list(
      filters({ player: "Carl_sen", playerColor: "black", eco: "c6", yearFrom: 2020, yearTo: 2024 }),
      null, 50, signal,
    );
    assert.ok(calls.some((c) => c[0] === "ilike" && c[1] === "black" && c[2] === "%Carl\\_sen%"));
    assert.ok(!calls.some((c) => c[0] === "ilike" && c[1] === "white"));
    assert.ok(calls.some((c) => c[0] === "ilike" && c[1] === "eco" && c[2] === "c6%"));
    assert.ok(calls.some((c) => c[0] === "gte" && c[1] === "played_at" && c[2] === "2020-01-01T00:00:00Z"));
    assert.ok(calls.some((c) => c[0] === "lt" && c[1] === "played_at" && c[2] === "2025-01-01T00:00:00Z"));
  });
  it("matches a player of any color with a quoted or() and swaps backwards years", async () => {
    const { client, calls } = fakeClient([row()], 5);
    await createMyGamesSource(() => client).list(filters({ player: "Li, (Q)", yearFrom: 2024, yearTo: 2020 }), null, 50, signal);
    assert.ok(calls.some((c) => c[0] === "or" && String(c[1]) === 'white.ilike."%Li, (Q)%",black.ilike."%Li, (Q)%"'));
    assert.ok(calls.some((c) => c[0] === "gte" && c[2] === "2020-01-01T00:00:00Z"));
  });
  it("narrows by rating on the server and checks the exact average on the page", async () => {
    const rows = [
      row({ id: "a", white_elo: 2600, black_elo: 2600 }),
      row({ id: "b", white_elo: 2900, black_elo: 2000 }), // within the server bounds, average 2450
    ];
    const { client, calls } = fakeClient(rows, 40);
    const page = await createMyGamesSource(() => client).list(filters({ eloMin: 2500, eloMax: 2700 }), null, 2, signal);
    assert.ok(calls.some((c) => c[0] === "not" && c[1] === "white_elo"));
    assert.ok(calls.some((c) => c[0] === "not" && c[1] === "black_elo"));
    assert.ok(calls.some((c) => c[0] === "or" && c[1] === "white_elo.gte.2500,black_elo.gte.2500"));
    assert.ok(calls.some((c) => c[0] === "or" && c[1] === "white_elo.lte.2700,black_elo.lte.2700"));
    assert.deepEqual(page.items.map((i) => i.gameId), ["a"]);
    assert.equal(page.nextCursor, "2"); // advances by the server rows read, not the kept ones
  });
  it("throws on query error and when unconfigured", async () => {
    const bad = createMyGamesSource(() => fakeClient([], 0, { message: "boom" }).client);
    await assert.rejects(bad.list(filters(), null, 10, signal), /boom/);
    await assert.rejects(createMyGamesSource(() => null).list(filters(), null, 10, signal), /not configured/);
  });
  it("declares capabilities", () => {
    const c = createMyGamesSource(() => null).capabilities();
    assert.equal(c.annotations, "none");
    assert.equal(c.position, "full");
    assert.equal(c.textSearch, "full");
  });
  it("filters by position through my_game_positions", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const { client, calls } = fakeClient([row()], 1);
    await createMyGamesSource(() => client).list(filters({ position: { fen } }), null, 10, signal);
    const select = calls.find((c) => c[0] === "select");
    assert.ok(String(select?.[1]).includes("my_game_positions!inner(game_id)"));
    assert.ok(calls.some((c) => c[0] === "eq" && c[1] === "my_game_positions.zkey" && c[2] === myGamesPositionKey(fen)));
  });
  it("does not join positions without a position filter", async () => {
    const { client, calls } = fakeClient([row()], 1);
    await createMyGamesSource(() => client).list(filters(), null, 10, signal);
    assert.ok(!String(calls.find((c) => c[0] === "select")?.[1]).includes("my_game_positions"));
  });
});

describe("queryLibrary", () => {
  beforeEach(() => clearLibrarySources());
  const dates = (id: "my-games" | "file:x", ds: (string | null)[]) => ds.map((d, i) => item(id, `${id[0]}${i}`, { date: d }));

  it("merges sources by sort with nulls last and ties by key", async () => {
    registerLibrarySource(fakeSource("my-games", dates("my-games", ["2024", "2022", null])));
    registerLibrarySource(fakeSource("file:x", dates("file:x", ["2023", "2022", null])));
    const r = await queryLibrary(filters({ sources: ["my-games", "file:x"] }), null, 10, signal);
    assert.deepEqual(r.items.map((i) => i.key), ["my-games:m0", "file:x:f0", "file:x:f1", "my-games:m1", "file:x:f2", "my-games:m2"]);
    assert.equal(r.total, 6);
    assert.equal(r.nextCursor, null);
  });

  it("paginates with a cursor without gaps or duplicates", async () => {
    registerLibrarySource(fakeSource("my-games", dates("my-games", ["2024", "2022", "2020", "2018"])));
    registerLibrarySource(fakeSource("file:x", dates("file:x", ["2023", "2021", "2019"])));
    const f = filters({ sources: ["my-games", "file:x"] });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r = await queryLibrary(f, cursor, 3, signal);
      seen.push(...r.items.map((i) => i.date ?? ""));
      cursor = r.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    assert.deepEqual(seen, ["2024", "2023", "2022", "2021", "2020", "2019", "2018"]);
    assert.equal(pages, 3);
  });

  it("keeps one offset per source in the cursor", async () => {
    registerLibrarySource(fakeSource("my-games", dates("my-games", ["2024", "2022"])));
    registerLibrarySource(fakeSource("file:x", dates("file:x", ["2023", "2021"])));
    const r = await queryLibrary(filters({ sources: ["my-games", "file:x"] }), null, 3, signal);
    assert.deepEqual(decodeLibraryCursor(r.nextCursor), { "my-games": 2, "file:x": 1 });
  });

  it("returns sourceErrors and still serves the other sources", async () => {
    registerLibrarySource(fakeSource("my-games", dates("my-games", ["2024"])));
    registerLibrarySource({ ...fakeSource("file:x", []), list: async () => { throw new Error("db down"); } });
    const r = await queryLibrary(filters({ sources: ["my-games", "file:x", "masters"] }), null, 10, signal);
    assert.equal(r.items.length, 1);
    assert.equal(r.sourceErrors["file:x"], "db down");
    assert.ok(r.sourceErrors.masters);
    assert.equal(r.total, 1);
  });

  it("rethrows when aborted and treats a bad cursor as the first page", async () => {
    registerLibrarySource(fakeSource("my-games", dates("my-games", ["2024"])));
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(queryLibrary(filters(), null, 10, ac.signal));
    const r = await queryLibrary(filters(), "%%%not-base64", 10, signal);
    assert.equal(r.items.length, 1);
  });
});

describe("advanced filter matchers", () => {
  const g = (o: Partial<LibraryGameItem>) => item("my-games", "x", o);
  it("player + color", () => {
    const game = g({ white: "Carlsen, Magnus", black: "Nakamura, Hikaru" });
    assert.ok(matchesPlayer(game, "carlsen", "both"));
    assert.ok(matchesPlayer(game, " Carlsen ", "white"));
    assert.ok(!matchesPlayer(game, "carlsen", "black"));
    assert.ok(matchesPlayer(game, "naka", "black"));
    assert.ok(matchesPlayer(game, "", "white"));
  });
  it("average Elo leaves out games with a missing rating", () => {
    const game = g({ whiteElo: 2600, blackElo: 2500 });
    assert.ok(matchesEloRange(game, { eloMin: 2550, eloMax: 2550 }));
    assert.ok(matchesEloRange(game, { eloMin: 2500, eloMax: null }));
    assert.ok(!matchesEloRange(game, { eloMin: 2551, eloMax: null }));
    assert.ok(!matchesEloRange(game, { eloMin: null, eloMax: 2549 }));
    assert.ok(matchesEloRange(game, { eloMin: 2600, eloMax: 2500 })); // swapped
    assert.ok(!matchesEloRange(g({ whiteElo: 2600, blackElo: null }), { eloMin: 1000, eloMax: null }));
    assert.ok(matchesEloRange(g({ whiteElo: null, blackElo: null }), { eloMin: null, eloMax: null }));
  });
  it("ECO prefix, case-insensitive", () => {
    assert.ok(matchesEco(g({ eco: "C65" }), "c6"));
    assert.ok(matchesEco(g({ eco: "C65" }), "C65"));
    assert.ok(matchesEco(g({ eco: "B01" }), "B"));
    assert.ok(!matchesEco(g({ eco: "C65" }), "C7"));
    assert.ok(!matchesEco(g({ eco: null }), "C"));
    assert.ok(matchesEco(g({ eco: null }), ""));
  });
  it("year range with partial and full dates", () => {
    const range = { yearFrom: 2020, yearTo: 2024 };
    assert.ok(matchesYearRange(g({ date: "2020" }), range));
    assert.ok(matchesYearRange(g({ date: "2024-12-31" }), range));
    assert.ok(matchesYearRange(g({ date: "2022-05" }), range));
    assert.ok(!matchesYearRange(g({ date: "2019-12-31" }), range));
    assert.ok(!matchesYearRange(g({ date: "2025" }), range));
    assert.ok(!matchesYearRange(g({ date: null }), range));
    assert.ok(matchesYearRange(g({ date: "2030" }), { yearFrom: 2020, yearTo: null }));
    assert.ok(matchesYearRange(g({ date: "1999" }), { yearFrom: null, yearTo: 2024 }));
    assert.ok(matchesYearRange(g({ date: null }), { yearFrom: null, yearTo: null }));
  });
  it("combines with AND", () => {
    const game = g({ white: "A", black: "B", whiteElo: 2500, blackElo: 2500, eco: "C65", date: "2022" });
    assert.ok(matchesAdvancedFilters(game, filters({ player: "a", playerColor: "white", eloMin: 2400, eco: "C", yearTo: 2022 })));
    assert.ok(!matchesAdvancedFilters(game, filters({ player: "a", eco: "B" })));
  });
});

describe("player suggestions", () => {
  const dbOf = (names: [string, string][]): FileDatabase => ({
    id: "s", name: "S", createdAt: 0, updatedAt: 0,
    games: names.map(([w, b], i) => ({ id: `g${i}`, white: w, black: b, result: "1-0", event: "", date: "", pgn: `[White "${w}"]\n[Black "${b}"]\n\n1. e4 1-0` })),
  } as unknown as FileDatabase);
  const db = dbOf([
    ["Carlsen, Magnus", "Nakamura, Hikaru"],
    ["Magnus Smith", "Carlsen, Magnus"],
    ["Caruana, Fabiano", "Nakamura, Hikaru"],
  ]);
  it("matches prefixes and word starts, distinct, prefixes first", () => {
    assert.deepEqual(suggestPlayersFromDatabases([db], "carl"), ["Carlsen, Magnus"]);
    assert.deepEqual(suggestPlayersFromDatabases([db], "MAG"), ["Magnus Smith", "Carlsen, Magnus"]);
    assert.deepEqual(suggestPlayersFromDatabases([db], "ca"), ["Carlsen, Magnus", "Caruana, Fabiano"]);
    assert.deepEqual(suggestPlayersFromDatabases([db], ""), []);
  });
  it("caps at 8", () => {
    const many = dbOf(Array.from({ length: 20 }, (_, i) => [`Player ${i}`, `Other ${i}`] as [string, string]));
    assert.equal(suggestPlayersFromDatabases([many], "pl").length, 8);
  });
});
