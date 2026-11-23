import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { Chess } from "chess.js";
import { buildDatabase } from "../../../scripts/xd-database/build.mjs";
import { otb, source } from "../../../scripts/opening-book/test-helpers.mjs";
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
const opening = "e4 e5 Nf3";
const playerName = "Álvarez, Ana";

function fen(sans: string) {
  const board = new Chess();
  for (const san of sans.split(" ")) board.move(san);
  return board.fen();
}

function request(path: string, query: Record<string, string> = {}) {
  return new Request(`https://app.test/api/xd-database/${path}?${new URLSearchParams(query)}`, {
    headers: { "cf-connecting-ip": "192.0.2.20" },
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
    ...Array.from({ length: scanLimit }, (_, id) => otb(opening, {
      ...draw, Round: String(id + 1), Date: "2024.01.01",
    })),
    otb(opening, {
      White: "Costa, Caio", Black: playerName, BlackFideId: "123",
      WhiteElo: "2500", BlackElo: "2600", Result: "0-1", Date: "2025.03.04",
    }),
    otb("b3 e5", { White: "Dias, Davi", Date: "2020.01.01" }),
  ].join("");
  const manifest = await buildDatabase([source(fixture)], {
    outDir: root, version: XD_DATABASE_VERSION, workers: 2, bucketBits: 2, maxPly: 2, pageBytes: 128,
  });
  assert.equal(manifest.stats.gamesKept, scanLimit + 2);
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
  assert.equal(body.total, scanLimit + 2);
  assert.equal(body.opening, null);
  assert.deepEqual(body.moves[0], {
    uci: "e2e4", white: 0, draws: scanLimit, black: 1, averageRating: 2600, lastYear: 2025,
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
    env.RL_60_MIN = { limit: async () => ({ success: false }) };
    assert.equal((await tree(lookup)).status, 200);
    assert.equal((await tree(request("tree", { fen: fen("d4") }))).status, 429);
  } finally {
    env.RL_60_MIN = original;
    if (descriptor) Object.defineProperty(globalThis, "caches", descriptor);
    else Reflect.deleteProperty(globalThis, "caches");
  }
});
