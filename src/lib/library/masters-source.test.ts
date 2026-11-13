import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIBRARY_FILTERS, type LibraryFilterState } from "./types.ts";
import { createMastersSource, MASTERS_UNAVAILABLE_MESSAGE } from "./masters-source.ts";

// Recorded (trimmed) shape of /api/explorer?source=masters for the start position.
const RECORDED = {
  source: "masters",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  white: 100,
  draws: 80,
  black: 60,
  opening: null,
  moves: [],
  games: [
    { id: "aaaaaaaa", winner: "white", whiteName: "Carlsen, Magnus", whiteRating: 2850, blackName: "Caruana, Fabiano", blackRating: 2800, year: 2019, month: 8, event: null, eco: null, opening: null },
    { id: "bbbbbbbb", winner: "draw", whiteName: "Kasparov, Garry", whiteRating: 2800, blackName: "Karpov, Anatoly", blackRating: 2750, year: 1985, month: null, event: null, eco: null, opening: null },
    { id: "cccccccc", winner: "black", whiteName: "Anand, Viswanathan", whiteRating: null, blackName: "Carlsen, Magnus", blackRating: 2860, year: null, month: null, event: null, eco: null, opening: null },
  ],
};
const WITH_OPENING = { ...RECORDED, fen: "fen-e4", opening: { eco: "B00", name: "King's Pawn" } };

const signal = new AbortController().signal;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const filters = (patch: Partial<LibraryFilterState> = {}): LibraryFilterState => ({
  ...DEFAULT_LIBRARY_FILTERS,
  sources: ["masters"],
  ...patch,
});

test("declares masters capabilities", () => {
  const caps = createMastersSource().capabilities();
  assert.deepEqual(caps, {
    textSearch: "partial", color: "partial", result: "partial",
    annotations: "none", position: "full", player: "partial", eloRange: "partial", eco: "partial", date: "partial",
    sort: "partial", maxResults: 15,
  });
});

test("maps rows through the app route for the start position", async () => {
  const urls: string[] = [];
  const source = createMastersSource({ fetchImpl: async (url) => (urls.push(String(url)), json(RECORDED)) });
  const page = await source.list(filters({ sort: { key: "date", direction: "desc" } }), null, 50, signal);
  assert.match(urls[0], /^\/api\/explorer\?fen=rnbqkbnr.*&source=masters$/);
  assert.equal(page.nextCursor, null);
  assert.deepEqual(page.items.map((i) => i.date), ["2019-08", "1985", null]);
  const first = page.items[0];
  assert.equal(first.key, "masters:aaaaaaaa");
  assert.equal(first.result, "1-0");
  assert.equal(first.plyCount, null);
  assert.equal(first.event, null);
  assert.equal(first.whiteElo, 2850);
});

test("eco and opening come from the searched position", async () => {
  const urls: string[] = [];
  const source = createMastersSource({ fetchImpl: async (url) => (urls.push(String(url)), json(WITH_OPENING)) });
  const page = await source.list(filters({ position: { fen: "fen-e4" } }), null, 50, signal);
  assert.match(urls[0], /fen=fen-e4/);
  assert.ok(page.items.every((i) => i.eco === "B00" && i.opening === "King's Pawn"));
});

test("client-side query, color/opponent and result filters", async () => {
  const source = createMastersSource({ fetchImpl: async () => json(RECORDED) });
  const run = async (patch: Partial<LibraryFilterState>) =>
    (await source.list(filters(patch), null, 50, signal)).items.map((i) => i.gameId);
  assert.deepEqual(await run({ query: "carlsen", sort: { key: "date", direction: "asc" } }), ["aaaaaaaa", "cccccccc"]);
  assert.deepEqual(await run({ result: "draw" }), ["bbbbbbbb"]);
  assert.deepEqual(await run({ result: "0-1" }), ["cccccccc"]);
  // color white => opponent is Black
  assert.deepEqual(await run({ color: "white", opponent: "carlsen" }), ["cccccccc"]);
  assert.deepEqual(await run({ color: "black", opponent: "carlsen" }), ["aaaaaaaa"]);
  assert.deepEqual((await run({ color: "both", opponent: "carlsen" })).sort(), ["aaaaaaaa", "cccccccc"]);
});

test("sorts with nulls last in both directions and honours limit", async () => {
  const source = createMastersSource({ fetchImpl: async () => json(RECORDED) });
  const asc = await source.list(filters({ sort: { key: "whiteElo", direction: "asc" } }), null, 50, signal);
  assert.deepEqual(asc.items.map((i) => i.gameId), ["bbbbbbbb", "aaaaaaaa", "cccccccc"]);
  const desc = await source.list(filters({ sort: { key: "whiteElo", direction: "desc" } }), null, 2, signal);
  assert.deepEqual(desc.items.map((i) => i.gameId), ["aaaaaaaa", "bbbbbbbb"]);
});

test("caps at 15 games", async () => {
  const many = { ...RECORDED, games: Array.from({ length: 20 }, (_, i) => ({ ...RECORDED.games[0], id: `g${i}` })) };
  const source = createMastersSource({ fetchImpl: async () => json(many) });
  assert.equal((await source.list(filters(), null, 50, signal)).items.length, 15);
});

test("throws a clear error on rate limit, failure, network error and backoff notice", async () => {
  for (const impl of [
    async () => json({ error: "slow down" }, 429),
    async () => json({ error: "x" }, 500),
    async () => { throw new TypeError("network"); },
    async () => json({ ...RECORDED, games: [], notice: "No games for this position." }),
  ]) {
    const source = createMastersSource({ fetchImpl: impl as typeof fetch });
    await assert.rejects(source.list(filters(), null, 15, signal), { message: MASTERS_UNAVAILABLE_MESSAGE });
  }
});

test("loadPgn goes through /api/masters-pgn", async () => {
  const urls: string[] = [];
  const source = createMastersSource({
    fetchImpl: async (url) => (urls.push(String(url)), new Response("1. e4 e5 *")),
  });
  assert.equal(await source.loadPgn("aaaaaaaa", signal), "1. e4 e5 *");
  assert.equal(urls[0], "/api/masters-pgn?id=aaaaaaaa");
  const failing = createMastersSource({ fetchImpl: async () => json({}, 429) });
  await assert.rejects(failing.loadPgn("aaaaaaaa", signal), { message: MASTERS_UNAVAILABLE_MESSAGE });
});

test("label follows the locale", () => {
  const source = createMastersSource();
  assert.equal(source.label("en"), "Masters (Lichess)");
  assert.equal(source.label("pt-br"), "Masters (Lichess)");
});
