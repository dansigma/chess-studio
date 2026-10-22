import assert from "node:assert/strict";
import test from "node:test";
import { chesscomGames, chesscomGamesSince, chesscomWinner, compactChesscomGame } from "./chesscom.ts";
import { mockFetch } from "@/src/test-utils/route-test.ts";
import { UpstreamPayloadTooLargeError } from "../read-capped.ts";

test("chesscomWinner reads the winning side and defaults to a draw", () => {
  assert.equal(chesscomWinner({ white: { result: "win" } }), "white");
  assert.equal(chesscomWinner({ black: { result: "win" } }), "black");
  assert.equal(chesscomWinner({ white: { result: "checkmated" }, black: { result: "resigned" } }), "draw");
  assert.equal(chesscomWinner({}), "draw");
});

test("compactChesscomGame normalizes a Chess.com archive game", () => {
  const game = compactChesscomGame(
    {
      url: "https://www.chess.com/game/live/123456",
      end_time: 1_600_000_000,
      time_class: "blitz",
      eco: "C50",
      white: { username: "Alice", rating: 1500, result: "win" },
      black: { username: "Bob", rating: 1400, result: "checkmated" },
    },
    "alice",
    0,
  );
  assert.equal(game.id, "123456");
  assert.equal(game.winner, "white");
  assert.equal(game.whiteName, "Alice");
  assert.equal(game.whiteRating, 1500);
  assert.equal(game.blackName, "Bob");
  assert.equal(game.blackRating, 1400);
  assert.equal(game.year, 2020);
  assert.equal(game.month, 9);
  assert.equal(game.event, "Chess.com");
  assert.equal(game.eco, "C50");
  assert.equal(game.opening, null);
  assert.equal(game.moves, undefined);
  assert.equal(game.timeClass, "blitz");
  assert.equal(game.color, "white");
  assert.equal(game.playerResult, "win");
  assert.equal(game.playedAt, 1_600_000_000_000);
});

test("compactChesscomGame marks the requested player as black and falls back to a synthetic id", () => {
  const game = compactChesscomGame(
    {
      end_time: 1_600_000_000,
      white: { username: "Alice", rating: 1500, result: "win" },
      black: { username: "Bob", rating: 1400, result: "checkmated" },
    },
    "bob",
    7,
  );
  assert.equal(game.id, "Alice-Bob-1600000000000");
  assert.equal(game.color, "black");
  assert.equal(game.playerResult, "loss");
});

test("chesscomGamesSince walks back to the since month and excludes older games", async (t) => {
  const fetched: string[] = [];
  const archives = [
    "https://api.chess.com/pub/player/magnuscarlsen/games/2026/08",
    "https://api.chess.com/pub/player/magnuscarlsen/games/2026/09",
    "https://api.chess.com/pub/player/magnuscarlsen/games/2026/10",
  ];
  const monthGames: Record<string, Array<{ url?: string; end_time?: number }>> = {
    "2026/08": [{ url: "https://www.chess.com/game/live/old1", end_time: 1_785_000_000 }],
    "2026/09": [{ url: "https://www.chess.com/game/live/mid1", end_time: 1_793_900_000 }],
    "2026/10": [
      { url: "https://www.chess.com/game/live/new1", end_time: 1_796_100_000 },
      { url: "https://www.chess.com/game/live/new2", end_time: 1_796_200_000 },
    ],
  };
  mockFetch(t, (url) => {
    if (url.includes("/games/archives")) {
      return new Response(JSON.stringify({ archives }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    for (const [month, games] of Object.entries(monthGames)) {
      if (url.includes(`/games/${month}`)) {
        fetched.push(url);
        return new Response(JSON.stringify({ games }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return null;
  });

  // sinceMs inside September (2026-09): October + September archives, August excluded.
  const games = await chesscomGamesSince("magnuscarlsen", Date.UTC(2026, 8, 15), 200);
  assert.deepEqual(
    fetched,
    [
      "https://api.chess.com/pub/player/magnuscarlsen/games/2026/10",
      "https://api.chess.com/pub/player/magnuscarlsen/games/2026/09",
    ],
  );
  assert.deepEqual(
    games.map((game) => game.id),
    ["new2", "new1", "mid1"],
  );
});

test("chesscomGamesSince stops at the max cap", async (t) => {
  const games2026_10 = Array.from({ length: 5 }, (_, i) => ({
    url: `https://www.chess.com/game/live/g${i}`,
    end_time: 1_760_000_000 + i,
  }));
  mockFetch(t, (url) => {
    if (url.includes("/games/archives")) {
      return new Response(
        JSON.stringify({ archives: ["https://api.chess.com/pub/player/magnuscarlsen/games/2026/10"] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/games/2026/10")) {
      return new Response(JSON.stringify({ games: games2026_10 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return null;
  });

  const games = await chesscomGamesSince("magnuscarlsen", 0, 3);
  assert.equal(games.length, 3);
});

test("chesscomGames throws UpstreamPayloadTooLargeError when archives response exceeds cap", async (t) => {
  mockFetch(t, (url) => {
    if (url.includes("/games/archives")) {
      return new Response("x".repeat(512 * 1024 + 100), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return null;
  });

  await assert.rejects(
    async () => {
      await chesscomGames("magnuscarlsen");
    },
    (err: unknown) => err instanceof UpstreamPayloadTooLargeError,
  );
});

test("chesscomGames throws UpstreamPayloadTooLargeError when monthly archive exceeds cap", async (t) => {
  mockFetch(t, (url) => {
    if (url.includes("/games/archives")) {
      return new Response(
        JSON.stringify({ archives: ["https://api.chess.com/pub/player/magnuscarlsen/games/2024/01"] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/games/2024/01")) {
      return new Response("x".repeat(2 * 1024 * 1024 + 100), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return null;
  });

  await assert.rejects(
    async () => {
      await chesscomGames("magnuscarlsen");
    },
    (err: unknown) => err instanceof UpstreamPayloadTooLargeError,
  );
});

