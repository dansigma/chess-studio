import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_POSITION } from "chess.js";
import { localizeOpeningName } from "../opening-names.ts";
import { createXdDatabaseSource } from "./xd-database-source.ts";
import { queryLibrary } from "./query.ts";
import { registerLibrarySource, unregisterLibrarySource } from "./sources.ts";
import { defaultLibraryFilters } from "./types.ts";

const filters = defaultLibraryFilters(["xadrez-digital"]);
const signal = new AbortController().signal;

test("passes position and game filters to the API, preferring the player filter over text search", async () => {
  const position = { fen: DEFAULT_POSITION.replace(" w ", " b ") };
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(init?.signal, signal);
    const url = new URL(String(input), "https://example.test");
    assert.equal(url.pathname, "/api/xd-database/games");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      fen: position.fen, playerQuery: "Alvaro", color: "black", result: "1/2-1/2",
      minRating: "2200", maxRating: "2600", minYear: "2020", maxYear: "2025",
    });
    return Response.json({
      games: [{
        id: 33, white: "Nora", black: "Álvaro", whiteElo: 2400, blackElo: 2400,
        result: "1/2-1/2", date: "2024.05.??", eco: "B90", event: "Open",
      }],
      nextCursor: null,
    });
  };
  const source = createXdDatabaseSource(fetchImpl);
  assert.equal(source.capabilities().maxResults, null);
  const page = await source.list({
    ...filters, position, player: " Alvaro ", query: "Nora", playerColor: "black", result: "draw",
    eloMin: 2200, eloMax: 2600, yearFrom: 2020, yearTo: 2025,
  }, null, 50, signal);
  assert.deepEqual(page.items, [{
    key: "xadrez-digital:33", sourceId: "xadrez-digital", gameId: "33",
    white: "Nora", black: "Álvaro", whiteElo: 2400, blackElo: 2400, result: "1/2-1/2",
    date: "2024-05", eco: "B90", event: "Open", opening: "Sicilian Defense: Najdorf Variation", plyCount: null,
  }]);
  assert.equal(page.nextCursor, null);
});

test("uses the shortest catalog name for an ECO code and leaves missing or unknown codes unnamed", async () => {
  const source = createXdDatabaseSource(async () => Response.json({
    games: [
      { id: 1, date: "2025", eco: " b90 " },
      { id: 2, date: "2024", eco: null },
      { id: 3, date: "2023", eco: "Z99" },
    ],
    nextCursor: null,
  }));
  const { items } = await source.list(filters, null, 50, signal);
  assert.deepEqual(items.map(({ opening }) => opening), ["Sicilian Defense: Najdorf Variation", null, null]);
  assert.equal(localizeOpeningName(items[0].opening!, "pt-br", items[0].eco), "Defesa Siciliana: Variante Najdorf");
});

test("Library carries server cursors across empty pages and retains unconsumed rows", async () => {
  const seen: string[] = [];
  const source = createXdDatabaseSource(async (input) => {
    const cursor = new URL(String(input), "https://example.test").searchParams.get("cursor")!;
    seen.push(cursor);
    return Response.json(cursor === "0" ? { games: [], nextCursor: 5000 } : {
      games: Array.from({ length: 20 }, (_, id) => ({ id, date: String(2000 + id) })),
      nextCursor: null,
    });
  });
  registerLibrarySource(source);
  try {
    const empty = await queryLibrary(filters, null, 15, signal);
    assert.equal(empty.items.length, 0);
    assert.ok(empty.nextCursor);
    const first = await queryLibrary(filters, empty.nextCursor, 15, signal);
    const last = await queryLibrary(filters, first.nextCursor, 15, signal);
    assert.equal(first.items.length, 15);
    assert.equal(last.items.length, 5);
    assert.equal(last.nextCursor, null);
    assert.equal(new Set([...first.items, ...last.items].map(({ key }) => key)).size, 20);
    assert.deepEqual(seen, ["0", "5000", "5000"]);
  } finally {
    unregisterLibrarySource(source.id);
  }
});

test("text search maps to a player query and carries opaque cursors through empty and partial pages", async () => {
  const seen: (string | null)[] = [];
  const source = createXdDatabaseSource(async (input) => {
    const url = new URL(String(input), "https://example.test");
    assert.equal(url.pathname, "/api/xd-database/games");
    assert.equal(url.searchParams.get("playerQuery"), "Leitão");
    assert.equal(url.searchParams.get("fen"), DEFAULT_POSITION);
    assert.equal(url.searchParams.has("player"), false);
    assert.equal(url.searchParams.has("color"), false);
    const cursor = url.searchParams.get("cursor");
    seen.push(cursor);
    return Response.json(cursor === null ? {
      games: [], nextCursor: "eyJwbGF5ZXIiOjIwfQ", playersCapped: true,
    } : {
      games: [
        { id: 1, white: "Leitao, Rafael", date: "2025" },
        { id: 2, white: "Leitao, Alexandre", date: "2024" },
      ],
      nextCursor: null, playersCapped: true,
    });
  });
  registerLibrarySource(source);
  try {
    const search = { ...filters, query: " Leitão " };
    const empty = await queryLibrary(search, null, 1, signal);
    assert.deepEqual(empty.items, []);
    assert.equal(empty.xdPlayersCapped, true);
    assert.ok(empty.nextCursor);
    const first = await queryLibrary(search, empty.nextCursor, 1, signal);
    assert.deepEqual(first.items.map(({ white }) => white), ["Leitao, Rafael"]);
    assert.ok(first.nextCursor);
    const last = await queryLibrary(search, first.nextCursor, 1, signal);
    assert.deepEqual(last.items.map(({ white }) => white), ["Leitao, Alexandre"]);
    assert.equal(last.nextCursor, null);
    assert.deepEqual(seen, [null, "eyJwbGF5ZXIiOjIwfQ", "eyJwbGF5ZXIiOjIwfQ"]);
  } finally {
    unregisterLibrarySource(source.id);
  }
});

test("an unmatched text search contributes no Xadrez Digital games", async () => {
  const source = createXdDatabaseSource(async (input) => {
    const query = new URL(String(input), "https://example.test").searchParams;
    assert.deepEqual(Object.fromEntries(query), { fen: DEFAULT_POSITION, playerQuery: "nobody" });
    return Response.json({ games: [], nextCursor: null, players: [], playersCapped: false });
  });
  const page = await source.list({ ...filters, query: "nobody" }, null, 50, signal);
  assert.deepEqual(page.items, []);
  assert.equal(page.nextCursor, null);
  assert.equal(page.playersCapped, false);
});

test("loads a game as PGN", async () => {
  const source = createXdDatabaseSource(async (input) => {
    assert.equal(input, "/api/xd-database/game/0");
    return new Response("1. e4 e5 1-0");
  });
  assert.equal(await source.loadPgn("0", signal), "1. e4 e5 1-0");
});
