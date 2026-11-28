import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { Chess } from "chess.js";
import { buildDatabase } from "../../../scripts/xd-database/build.mjs";
import { otb, source, who } from "../../../scripts/opening-book/test-helpers.mjs";
import { POSITION_GAME_BYTES } from "@/src/lib/xd-database/format";
import { XD_DATABASE_PREFIX, XD_DATABASE_VERSION } from "@/src/lib/xd-database/manifest";
import { GET as tree } from "./tree/route";
import { GET as games } from "./games/route";
import { GET as game } from "./game/[id]/route";
import { GET as players } from "./players/route";
import { GET as playerGames } from "./players/[id]/games/route";

const root = mkdtempSync(join(tmpdir(), "xd-api-"));
const host = globalThis as typeof globalThis & { __CF_ENV?: Record<string, unknown> };
const reads: { key: string; range?: { offset: number; length: number } }[] = [];
const start = new Chess().fen();
const scanLimit = Math.floor(65536 / POSITION_GAME_BYTES);
const opening = "e4 e5 Nf3 Nc6";
const transposedOpening = "Nc3 e5 e4";
const transposedCount = 22;
const playerName = "Álvarez, Ana";
const leitaoDates = ["2016.03.04", undefined, "2016.??.??", ...Array<string>(20).fill("2024.08.01")];
const leitaoStart = scanLimit + 2;
const sharedGameId = leitaoStart + 3;
const fixtureCount = leitaoStart + leitaoDates.length + 21;

function fen(sans: string) {
  const board = new Chess();
  for (const san of sans.split(" ")) board.move(san);
  return board.fen();
}

function request(path: string, query: Record<string, string> = {}, ip = "192.0.2.20") {
  return new Request(`https://app.test/api/xd-database/${path}?${new URLSearchParams(query)}`, {
    headers: { "cf-connecting-ip": ip },
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

before(async () => {
  const draw = {
    White: playerName, WhiteFideId: "123", Black: "Borges, Beatriz",
    WhiteElo: "2700", BlackElo: "2500", Result: "1/2-1/2",
  };
  const fixture = [
    ...Array.from({ length: scanLimit }, (_, id) => {
      const moves = id === transposedCount + 1 ? `Nf3 Nf6 Ng1 Ng8 ${opening}`
        : id > 0 && id <= transposedCount ? transposedOpening : opening;
      return otb(moves, { ...draw, Round: String(id + 1), Date: "2024.01.01" });
    }),
    otb(opening, {
      White: "Costa, Caio", Black: playerName, BlackFideId: "123",
      WhiteElo: "2500", BlackElo: "2600", Result: "0-1", Date: "2025.03.04",
    }),
    otb("b3 e5", { White: "Dias, Davi", Date: "2020.01.01" }),
    ...leitaoDates.map((Date, i) => otb("c4 e5", {
      Date,
      Round: String(i + 1),
      White: i % 2 === 0 ? "Leitao, Rafael" : "Leitao, Nicolau",
      Black: i === 3 ? "Leitao, Rafael" : "Opponent, Olivia",
      WhiteElo: i === 1 ? undefined : "2400",
      BlackElo: i === 1 ? undefined : "2000",
      Result: i === 3 ? "0-1" : "1-0",
    })),
    ...Array.from({ length: 21 }, (_, i) => otb("c4 e5", {
      White: who("Capped", i) + ", Carol",
    })),
  ].join("");
  const manifest = await buildDatabase([source(fixture)], {
    outDir: root, version: XD_DATABASE_VERSION, workers: 2, bucketBits: 2, maxPly: 3, pageBytes: 128,
  });
  assert.equal(manifest.stats.gamesKept, fixtureCount);
  const files = new Map(Object.keys(manifest.files).map((file) => [
    XD_DATABASE_PREFIX + file, readFileSync(join(root, `v${XD_DATABASE_VERSION}`, file)),
  ]));
  host.__CF_ENV = {
    RL_60_MIN: { limit: async () => ({ success: true }) },
    XD_DATABASE: {
      async get(key: string, options?: { range: { offset: number; length: number } }) {
        const range = options?.range;
        reads.push({ key, range });
        const file = files.get(key);
        if (!file) return null;
        if (key.endsWith(".bin")) assert.ok(range, "data files require ranged reads");
        const bytes = range ? file.subarray(range.offset, range.offset + range.length) : file;
        return { arrayBuffer: async () => Uint8Array.from(bytes).buffer };
      },
    },
  };
});

after(() => {
  delete host.__CF_ENV;
  rmSync(root, { recursive: true, force: true });
});

test("tree uses range reads, caches its index and returns move statistics", async () => {
  const response = await tree(request("tree", { fen: start }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
  assert.equal(response.headers.get("X-XD-Database-Version"), String(XD_DATABASE_VERSION));
  const body = await response.json();
  assert.equal(body.total, fixtureCount);
  assert.equal(body.opening, null);
  assert.deepEqual(body.moves[0], {
    uci: "e2e4", white: 0, draws: scanLimit - transposedCount - 1, black: 1, averageRating: 2600, lastYear: 2025,
  });
  const second = await tree(request("tree", { fen: fen("e4 e5") }));
  assert.ok((await second.json()).opening?.name);
  assert.equal(reads.filter(({ key }) => key.endsWith("tree.idx")).length, 1);
});

test("missing positions yield empty moves and games", async () => {
  for (const position of [fen("b3"), fen(opening)]) {
    const treeResponse = await tree(request("tree", { fen: position }));
    assert.deepEqual((await treeResponse.json()).moves, []);
    const gamesResponse = await games(request("games", { fen: position }));
    assert.deepEqual(await gamesResponse.json(), { games: [], nextCursor: null });
  }
});

test("bad FENs, cursors and filters return 400", async () => {
  for (const route of [tree, games]) {
    assert.equal((await route(request("position", { fen: "invalid" }))).status, 400);
    assert.equal((await route(request("position", { fen: "8/8/8/8/8/8/8/8 w - - 0 1" }))).status, 400);
  }
  assert.equal((await games(request("games", { fen: start, cursor: "-2" }))).status, 400);
  assert.equal((await games(request("games", { fen: start, color: "black" }))).status, 400);
  assert.equal((await games(request("games", { fen: start, minYear: "2025", maxYear: "2024" }))).status, 400);
  assert.equal((await players(request("players"))).status, 400);
});

test("position games page in strongest-first order and return only headers", async () => {
  const beforeFirst = reads.length;
  const first = await (await games(request("games", { fen: start }))).json();
  assert.ok(!reads.slice(beforeFirst).some(({ key }) => key.endsWith("/position-games.bin")));
  assert.equal(first.games.length, 20);
  assert.equal(first.games[0].id, 0);
  assert.equal(first.games[0].white, playerName);
  assert.equal(first.games[0].whiteElo, 2700);
  assert.equal(first.games[0].moves, undefined);
  assert.equal(first.nextCursor, 20);
  const second = await (await games(request("games", { fen: start, cursor: String(first.nextCursor) }))).json();
  assert.equal(second.games[0].id, 20);
  assert.equal(second.nextCursor, 40);
});

test("players search and game pages use directory ids and newest-first order", async () => {
  const response = await players(request("players", { q: "alvAr" }));
  const body = await response.json();
  assert.equal(body.players.length, 1);
  const [entry] = body.players;
  assert.equal(entry.name, playerName);
  assert.equal(entry.fideId, 123);
  assert.equal(entry.count, scanLimit + 1);
  for (const q of ["Ana Alvarez", "Álvarez,Ana"]) {
    const byWords = await players(request("players", { q }));
    assert.equal(byWords.status, 200);
    assert.deepEqual(await byWords.json(), body);
  }
  const playerId = entry.id;
  const first = await (await playerGames(request(`players/${playerId}/games`), idParams(playerId))).json();
  assert.equal(first.games[0].black, playerName);
  assert.equal(first.games[0].id, scanLimit);
  assert.equal(first.nextCursor, 20);
  const last = await playerGames(request(`players/${playerId}/games`, { cursor: String(scanLimit) }), idParams(playerId));
  assert.deepEqual((await last.json()).games.map(({ id }: { id: number }) => id), [0]);
  assert.equal((await playerGames(request("players/9999-0/games"), idParams("9999-0"))).status, 404);
});

test("scan filters intersect postings and keep the cursor after an empty scan", async () => {
  const { players: [player] } = await (await players(request("players", { q: "alvar" }))).json();
  const query = {
    fen: start, player: player.id, color: "black",
    minRating: "2549", maxRating: "2551", minYear: "2025", maxYear: "2025", result: "0-1",
  };
  const first = await games(request("games", query));
  assert.equal(first.headers.get("Cache-Control"), "public, max-age=30, s-maxage=60");
  assert.deepEqual(await first.json(), { games: [], nextCursor: scanLimit });
  const postingRead = reads.findLast(({ key }) => key.endsWith("/position-games.bin"));
  assert.equal(postingRead?.range?.length, scanLimit * POSITION_GAME_BYTES);
  const last = await games(request("games", { ...query, cursor: String(scanLimit) }));
  const data = await last.json();
  assert.equal(data.games[0].id, scanLimit);
  assert.equal(data.games.length, 1);
  assert.equal(data.nextCursor, null);
  for (const [filter, value] of [
    ["color", "white"], ["minRating", "2551"], ["maxRating", "2549"],
    ["minYear", "2026"], ["maxYear", "2024"], ["result", "1-0"], ["player", "9999-0"],
  ]) {
    const response = await games(request("games", {
      fen: start, player: player.id, cursor: String(scanLimit), [filter]: value,
    }));
    if (filter === "player") assert.equal(response.status, 404);
    else assert.deepEqual(await response.json(), { games: [], nextCursor: null });
  }
});

test("playerQuery merges matching players, dates and ties across pages", async () => {
  const beforeReads = reads.length;
  const query = { fen: start, playerQuery: "  leitão  " };
  const seen: number[] = [];
  let cursor: string | null = null;
  for (const expectedSize of [20, 3]) {
    const response = await games(request("games", cursor ? { ...query, cursor } : query));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=30, s-maxage=60");
    const body = await response.json();
    assert.deepEqual(body.players.map(({ id, name, count }: { id: string; name: string; count: number }) => {
      assert.match(id, /^\d+-\d+$/);
      return { name, count };
    }), [{ name: "Leitao, Rafael", count: 13 }, { name: "Leitao, Nicolau", count: 11 }]);
    assert.equal(body.playersCapped, false);
    assert.equal(body.games.length, expectedSize);
    assert.ok(body.games.every((entry: object) => !("moves" in entry)));
    seen.push(...body.games.map(({ id }: { id: number }) => id));
    cursor = body.nextCursor;
    if (expectedSize === 20) assert.equal(typeof cursor, "string");
  }
  assert.equal(cursor, null);
  const newest = leitaoDates.slice(3).map((_, i) => sharedGameId + i).reverse();
  assert.deepEqual(seen, [...newest, leitaoStart, leitaoStart + 2, leitaoStart + 1]);
  assert.ok(!reads.slice(beforeReads).some(({ key }) => /\/(tree|position-games)\.bin$/.test(key)));
});

test("playerQuery filters by either matched side, result, rating and year", async () => {
  const query = {
    fen: start, playerQuery: "leitao", minRating: "2200", maxRating: "2200",
    minYear: "2024", maxYear: "2024", result: "0-1",
  };
  for (const color of ["white", "black"]) {
    const response = await games(request("games", { ...query, color }));
    const body = await response.json();
    assert.deepEqual(body.games.map(({ id }: { id: number }) => id), [sharedGameId]);
    assert.equal(body.nextCursor, null);
  }
  for (const filter of [{ maxRating: "2199", minRating: "0" }, { minYear: "2025", maxYear: "2025" }]) {
    const body = await (await games(request("games", { ...query, ...filter }))).json();
    assert.deepEqual(body.games, []);
  }
  const rated = await (await games(request("games", {
    fen: start, playerQuery: "leitao", maxYear: "2016", minRating: "1",
  }))).json();
  assert.deepEqual(rated.games.map(({ id }: { id: number }) => id), [leitaoStart, leitaoStart + 2]);
});

test("playerQuery advances past a bounded scan of rejected games", async () => {
  const query = { fen: start, playerQuery: "alvarez", minYear: "2026" };
  const first = await (await games(request("games", query))).json();
  assert.deepEqual(first.games, []);
  assert.equal(typeof first.nextCursor, "string");
  const second = await (await games(request("games", { ...query, cursor: first.nextCursor }))).json();
  assert.deepEqual(second.games, []);
  assert.equal(typeof second.nextCursor, "string");
  assert.notEqual(second.nextCursor, first.nextCursor);
});

test("playerQuery pages through transpositions after empty scans", async () => {
  const query = { fen: fen("e4 e5 Nc3"), playerQuery: "alvarez", result: "1/2-1/2", color: "white" };
  const ids: number[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (const size of [...Array<number>(Math.floor((scanLimit - transposedCount + 1) / 500)).fill(0), 20, 2]) {
    const response = await games(request("games", cursor ? { ...query, cursor } : query, "192.0.2.21"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.games.length, size);
    assert.ok(body.games.every((entry: object) => !("moves" in entry)));
    ids.push(...body.games.map(({ id }: { id: number }) => id));
    cursor = body.nextCursor;
    if (size !== 2) {
      assert.ok(typeof cursor === "string");
      assert.ok(!cursors.has(cursor));
      cursors.add(cursor);
    }
  }
  assert.equal(cursor, null);
  assert.deepEqual(ids, Array.from({ length: transposedCount }, (_, i) => transposedCount - i));
});

test("playerQuery replays candidates at a position with many games", async () => {
  const beforeReads = reads.length;
  const query = { fen: fen("e4 e5 Nf3"), playerQuery: "alvarez" };
  const response = await games(request("games", query));
  assert.equal(response.status, 200);
  const first = await response.json();
  assert.deepEqual(first.games.map(({ id }: { id: number }) => id), Array.from({ length: 20 }, (_, i) => scanLimit - i));
  const nearEnd = Buffer.from(JSON.stringify({ [first.players[0].id]: scanLimit - transposedCount - 2 })).toString("base64url");
  const last = await (await games(request("games", { ...query, cursor: nearEnd }))).json();
  assert.deepEqual(last.games.map(({ id }: { id: number }) => id), [transposedCount + 2, 0]);
  assert.equal(last.nextCursor, null);
  assert.ok(!reads.slice(beforeReads).some(({ key }) => key.endsWith("/position-games.bin")));
});

test("playerQuery returns player metadata for a position beyond the tree depth", async () => {
  const query = { fen: start, playerQuery: "alvarez" };
  const { players, playersCapped } = await (await games(request("games", query))).json();
  assert.equal(players.length, 1);
  const beforeReads = reads.length;
  const response = await games(request("games", { ...query, fen: fen(opening) }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { games: [], nextCursor: null, players, playersCapped });
  assert.ok(!reads.slice(beforeReads).some(({ key }) => /\/(games|player-games|position-games)\.bin$/.test(key)));
});

test("playerQuery reports capped and empty player matches", async () => {
  const response = await games(request("games", { fen: start, playerQuery: "capped" }));
  const body = await response.json();
  assert.equal(body.players.length, 20);
  assert.equal(body.playersCapped, true);
  assert.equal(body.games.length, 20);
  assert.equal(body.nextCursor, null);
  const empty = await games(request("games", { fen: start, playerQuery: "nobody" }));
  assert.deepEqual(await empty.json(), { games: [], nextCursor: null, players: [], playersCapped: false });
});

test("playerQuery rejects invalid filters, positions and cursors", async () => {
  const query = { fen: start, playerQuery: "leitao" };
  const otherPosition = await games(request("games", { ...query, fen: "invalid" }));
  assert.equal(otherPosition.status, 400);
  assert.deepEqual(await otherPosition.json(), { error: "fen is not a valid position" });
  const invalidQueries: Record<string, string>[] = [
    { player: "0-0" }, { playerQuery: " " }, { playerQuery: "a".repeat(121) }, { cursor: "!" },
    ...["[]", "{}", '{"0-0":-1}', '{"0-0":"1"}'].map((value) => ({ cursor: Buffer.from(value).toString("base64url") })),
  ];
  for (const invalid of invalidQueries) {
    assert.equal((await games(request("games", { ...query, ...invalid }))).status, 400);
  }
});

test("game returns loadable PGN and missing ids return 404", async () => {
  const response = await game(request("game/0"), idParams("0"));
  assert.equal(response.headers.get("Content-Type"), "application/x-chess-pgn; charset=utf-8");
  const pgn = await response.text();
  const board = new Chess();
  board.loadPgn(pgn);
  assert.equal(board.getHeaders().White, playerName);
  assert.equal(board.getHeaders().WhiteFideId, "123");
  assert.deepEqual(board.history(), opening.split(" "));
  for (const id of ["8000000", "invalid"]) {
    assert.equal((await game(request(`game/${id}`), idParams(id))).status, 404);
  }
});

test("edge cache keys use the manifest version and cached hits skip the limiter", async () => {
  const cached = new Map<string, Response>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { default: {
      match: async (key: string) => cached.get(key)?.clone(),
      put: async (key: string, response: Response) => { cached.set(key, response); },
    } },
  });
  const env = host.__CF_ENV!;
  const original = env.RL_60_MIN;
  try {
    const lookup = request("tree", { fen: start });
    assert.equal((await tree(lookup)).status, 200);
    assert.ok([...cached.keys()].some((key) => new URL(key).searchParams.get("__xd_version") === String(XD_DATABASE_VERSION)));
    const beforeGames = reads.length;
    assert.equal((await games(request("games", { fen: start }))).status, 200);
    assert.ok(!reads.slice(beforeGames).some(({ key }) => key.endsWith("/tree.bin")));
    const beforeGame = reads.length;
    assert.equal((await game(request("game/0"), idParams("0"))).status, 200);
    assert.ok(!reads.slice(beforeGame).some(({ key }) => key.endsWith("/games.bin")));
    const byName = request("games", { fen: start, playerQuery: "leitao" });
    assert.equal((await games(byName)).status, 200);
    assert.ok(![...cached.keys()].some((key) => new URL(key).searchParams.has("playerQuery")));
    env.RL_60_MIN = { limit: async () => ({ success: false }) };
    assert.equal((await games(byName)).status, 429);
    assert.equal((await tree(lookup)).status, 200);
    assert.equal((await tree(request("tree", { fen: fen("d4") }))).status, 429);
  } finally {
    env.RL_60_MIN = original;
    if (descriptor) Object.defineProperty(globalThis, "caches", descriptor);
    else Reflect.deleteProperty(globalThis, "caches");
  }
});

function serverTiming(response: Response) {
  const header = response.headers.get("Server-Timing");
  assert.ok(header, "Server-Timing is set");
  if (/edge;desc=hit$/.test(header ?? "")) {
    assert.match(header ?? "", /^total;dur=\d+, edge;desc=hit$/);
    return { reads: 0, hits: 0, misses: 0, edge: "hit" };
  }
  const match = /^total;dur=(\d+), r2;dur=(\d+);desc="(\d+) reads", cache;desc="(\d+) hit (\d+) miss", edge;desc=(hit|miss|off)$/.exec(header ?? "");
  assert.ok(match, `parsable: ${header}`);
  return { reads: Number(match[3]), hits: Number(match[4]), misses: Number(match[5]), edge: match[6] };
}

test("Server-Timing reports R2 reads, range cache and full-response cache state", async () => {
  const store = new Map<string, Response>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { default: {
      match: async (key: string) => {
        const hit = store.get(key);
        // Like the real cache: the returned headers are immutable.
        return hit && new Response(hit.clone().body, { headers: hit.headers });
      },
      put: async (key: string, response: Response) => { store.set(key, response); },
    } },
  });
  try {
    const query = { fen: fen("e4 e5") };
    const first = await tree(request("tree", query));
    const firstTiming = serverTiming(first);
    assert.equal(firstTiming.edge, "miss");
    assert.ok(firstTiming.reads >= 1);
    assert.ok(firstTiming.hits + firstTiming.misses >= 1);
    const firstBody = await first.text();
    const stored = [...store.entries()].find(([key]) => !key.includes("__range"));
    assert.equal(stored?.[1].headers.get("Server-Timing"), null);

    const second = await tree(request("tree", query));
    assert.equal(serverTiming(second).edge, "hit");
    assert.equal(second.headers.get("Cache-Control"), "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    assert.equal(await second.text(), firstBody);

    // A different position reuses the cached index and ranges where it can: no R2 read of tree.idx.
    const before = reads.length;
    const other = await tree(request("tree", { fen: fen("d4") }));
    assert.equal(serverTiming(other).edge, "miss");
    assert.ok(!reads.slice(before).some(({ key }) => key.endsWith("tree.idx")));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "caches", descriptor);
    else Reflect.deleteProperty(globalThis, "caches");
  }
});

test("a failing edge cache write still returns the response with Server-Timing", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { default: { match: async () => undefined, put: async () => { throw new Error("quota"); } } },
  });
  try {
    const response = await tree(request("tree", { fen: fen("e4 c5") }));
    assert.equal(response.status, 200);
    serverTiming(response);
    assert.ok((await response.json()).moves);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "caches", descriptor);
    else Reflect.deleteProperty(globalThis, "caches");
  }
});

test("without an edge cache every API still reports Server-Timing", async () => {
  const responses = [
    await tree(request("tree", { fen: start })),
    await games(request("games", { fen: start })),
    await game(request("game/0"), idParams("0")),
    await players(request("players", { q: "alvar" })),
  ];
  for (const response of responses) assert.equal(serverTiming(response).edge, "off");
});
