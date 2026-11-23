import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess } from "chess.js";
import { fetchXdExplorer } from "./explorer.ts";

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
  const response = await fetchXdExplorer(fen, { fetchImpl, includeGames: true });
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
  const response = await fetchXdExplorer(new Chess().fen(), { fetchImpl, includeGames: true });
  assert.equal(requests, 1);
  assert.equal(response.total, 0);
  assert.deepEqual(response.moves, []);
  assert.deepEqual(response.games, []);
});
