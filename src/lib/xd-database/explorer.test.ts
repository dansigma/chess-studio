import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess } from "chess.js";
import { createXdExplorer, fetchXdGames, fetchXdMoves } from "./explorer.ts";

test("loads the database tree, SAN, opening, counts and optional game headers", async () => {
  const chess = new Chess();
  chess.move("e4");
  const fen = chess.fen();
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input), "https://example.test");
    assert.equal(url.searchParams.get("fen"), fen);
    paths.push(url.pathname);
    return Response.json(url.pathname.endsWith("/tree") ? {
      opening: { eco: "B00", name: "King's Pawn Opening" },
      total: 12,
      moves: [{ uci: "e7e5", white: 4, draws: 3, black: 2, averageRating: 2380, lastYear: 2025 }],
    } : {
      games: [{ id: 0, white: "White", black: "Black", result: "0-1", date: "2025.02.??" }],
      nextCursor: null,
    });
  };
  const request = createXdExplorer(fetchImpl).load(fen, {}, true, new AbortController().signal);
  const response = { ...await request.moves, games: (await request.games)! };
  assert.deepEqual(paths, ["/api/xd-database/tree", "/api/xd-database/games"]);
  assert.equal(response.source, "xadrez-digital");
  assert.equal(response.total, 12);
  assert.equal(response.opening?.eco, "B00");
  assert.deepEqual(response.moves, [{
    uci: "e7e5", san: "e5", games: 9, white: 4, draws: 3, black: 2, averageRating: 2380,
  }]);
  assert.equal(response.games[0].id, "0");
  assert.equal(response.games[0].winner, "black");
  assert.equal(response.games[0].month, 2);
});

test("an off-tree position returns an empty response without requesting games", async () => {
  let requests = 0;
  const fetchImpl: typeof fetch = async () => {
    requests++;
    return Response.json({ opening: null, total: 0, moves: [] });
  };
  const response = await fetchXdMoves(new Chess().fen(), new AbortController().signal, fetchImpl);
  assert.equal(requests, 1);
  assert.equal(response.total, 0);
  assert.deepEqual(response.moves, []);
  assert.deepEqual(response.games, []);
});

test("filters only game requests and collects a full page across scan windows", async () => {
  const fen = new Chess().fen();
  const cursors: (string | null)[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input), "https://example.test");
    assert.equal(url.searchParams.get("fen"), fen);
    if (url.pathname.endsWith("/tree")) {
      assert.deepEqual([...url.searchParams.keys()], ["fen"]);
      return Response.json({
        opening: null,
        total: 50000,
        moves: [{ uci: "e2e4", white: 20000, draws: 10000, black: 20000, averageRating: 2380 }],
      });
    }
    assert.equal(url.pathname, "/api/xd-database/games");
    assert.equal(url.searchParams.get("minRating"), "2700");
    assert.equal(url.searchParams.get("minYear"), "2020");
    assert.equal(url.searchParams.get("maxYear"), "2025");
    const cursor = url.searchParams.get("cursor");
    cursors.push(cursor);
    const count = cursor === null ? 0 : cursor === "5461" ? 3 : 20;
    return Response.json({
      games: Array.from({ length: count }, (_, index) => ({ id: Number(cursor) + index, date: "2025" })),
      nextCursor: Number(cursor) + 5461,
    });
  };
  const request = createXdExplorer(fetchImpl).load(fen, {
    minRating: 2700, sinceYear: 2020, untilYear: 2025,
  }, true, new AbortController().signal);
  const rows = (await request.games)!;
  assert.deepEqual(cursors, [null, "5461", "10922"]);
  assert.equal(rows.length, 20);
  assert.equal(rows[0].id, "5461");
  assert.equal(rows.at(-1)?.id, "10938");
  const moves = await request.moves;
  assert.equal(moves.total, 50000);
  assert.equal(moves.moves[0].games, 50000);
});

test("caps sparse filtered searches at four game requests and leaves unfiltered searches at one", async () => {
  for (const [minRating, expectedRequests] of [[2700, 4], [0, 1]]) {
    let gamesRequests = 0;
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes("/tree?")) return Response.json({ opening: null, total: 50000, moves: [] });
      gamesRequests++;
      return Response.json({ games: [], nextCursor: gamesRequests * 5461 });
    };
    const rows = await fetchXdGames(new Chess().fen(), { minRating }, new AbortController().signal, fetchImpl);
    assert.equal(gamesRequests, expectedRequests);
    assert.deepEqual(rows, []);
  }
});

test("deduplicates each resource, survives one subscriber aborting and serves a revisit", async () => {
  const calls: string[] = [];
  const pendingGames = Promise.withResolvers<Response>();
  const explorer = createXdExplorer(async (input, init) => {
    assert.equal(init?.signal?.aborted, false);
    calls.push(String(input));
    if (String(input).includes("/games?")) return pendingGames.promise;
    return Response.json({ opening: null, total: 1, moves: [] });
  });
  const chess = new Chess();
  const fen = chess.fen();
  const first = new AbortController();
  const second = new AbortController();
  const a = explorer.load(fen, {}, true, first.signal);
  const b = explorer.load(fen, {}, true, second.signal);
  first.abort();
  await assert.rejects(a.moves, { name: "AbortError" });
  await assert.rejects(a.games!, { name: "AbortError" });
  assert.equal((await b.moves).total, 1);
  assert.equal(calls.length, 2);

  pendingGames.resolve(Response.json({ games: [], nextCursor: null }));
  assert.deepEqual(await b.games, []);
  chess.move("e4");
  await explorer.load(chess.fen(), {}, false, second.signal).moves;
  const revisit = explorer.load(fen, {}, true, second.signal);
  assert.equal(await revisit.moves, await b.moves);
  assert.equal(await revisit.games, await b.games);
  assert.equal(calls.length, 3);
});

test("prefetches only the three most played child positions at low priority and aborts unused reads", async () => {
  const calls: { fen: string; signal: AbortSignal; priority?: RequestPriority }[] = [];
  const explorer = createXdExplorer(async (input, init) => {
    const fen = new URL(String(input), "https://example.test").searchParams.get("fen")!;
    calls.push({ fen, signal: init!.signal!, priority: init?.priority });
    if (init?.priority === "low") {
      return new Promise<Response>((_, reject) => {
        init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
      });
    }
    return Response.json({
      opening: null, total: 23,
      moves: [["a2a3", 1], ["d2d4", 8], ["c2c4", 4], ["e2e4", 10]].map(([uci, white]) => ({
        uci, white, draws: 0, black: 0,
      })),
    });
  });
  const board = new Chess();
  const controller = new AbortController();
  const root = await explorer.load(board.fen(), {}, false, controller.signal).moves;
  const prefetch = explorer.prefetch(root, controller.signal);
  assert.deepEqual(calls.slice(1).map(({ fen }) => fen), ["e4", "d4", "c4"].map((san) => {
    const move = board.move(san);
    board.undo();
    return move.after;
  }));
  assert.ok(calls.slice(1).every(({ priority }) => priority === "low"));
  controller.abort();
  await prefetch;
  assert.ok(calls.slice(1).every(({ signal }) => signal.aborted));
  await explorer.prefetch(root, controller.signal);
  assert.equal(calls.length, 4);
});
