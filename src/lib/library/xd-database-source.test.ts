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

test("passes position and game filters to the API, resolving a player directory ID", async () => {
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(init?.signal, signal);
    const url = new URL(String(input), "https://example.test");
    if (url.pathname.endsWith("/players")) {
      assert.equal(url.searchParams.get("q"), "Alvaro");
      return Response.json({ players: [{ id: "10-0", name: "Álvaro" }] });
    }
    assert.equal(url.pathname, "/api/xd-database/games");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      fen: DEFAULT_POSITION, player: "10-0", color: "black", result: "1/2-1/2",
      minRating: "2200", maxRating: "2600", minYear: "2020", maxYear: "2025", cursor: "0",
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
    ...filters, player: "Alvaro", playerColor: "black", result: "draw",
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

test("loads a game as PGN", async () => {
  const source = createXdDatabaseSource(async (input) => {
    assert.equal(input, "/api/xd-database/game/0");
    return new Response("1. e4 e5 1-0");
  });
  assert.equal(await source.loadPgn("0", signal), "1. e4 e5 1-0");
});
