import assert from "node:assert/strict";
import test from "node:test";
import {
  chesscomGames,
  chesscomGamesSince,
  chesscomWinner,
  compactChesscomGame,
  searchChesscom,
} from "./chesscom.ts";
import { mockFetch } from "@/src/test-utils/route-test.ts";
import { UpstreamPayloadTooLargeError } from "../read-capped.ts";
import { NoPublicGamesError } from "./shared.ts";

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
  assert.equal(game.rated, null);
  assert.equal(game.color, "white");
  assert.equal(game.playerResult, "win");
  assert.equal(game.playedAt, 1_600_000_000_000);
});

test("compactChesscomGame carries the rated flag, defaulting to null", () => {
  const rated = compactChesscomGame(
    {
      url: "https://www.chess.com/game/live/789",
      end_time: 1_600_000_000,
      time_class: "rapid",
      rated: false,
      white: { username: "Alice", rating: 1500, result: "win" },
      black: { username: "Bob", rating: 1400, result: "checkmated" },
    },
    "alice",
    0,
  );
  assert.equal(rated.rated, false);
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

test("chesscomGamesSince bounds the walk when no archive matches the cutoff month", async (t) => {
  // A decade of monthly archives with a cutoff that matches none of them:
  // without the per-sync archive cap this fans out to 120 sequential fetches.
  const archives = Array.from({ length: 120 }, (_, i) => {
    const year = 2016 + Math.floor(i / 12);
    const month = String((i % 12) + 1).padStart(2, "0");
    return `https://api.chess.com/pub/player/magnuscarlsen/games/${year}/${month}`;
  });
  const fetched: string[] = [];
  mockFetch(t, (url) => {
    if (url.includes("/games/archives")) {
      return new Response(JSON.stringify({ archives }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    fetched.push(url);
    return new Response(JSON.stringify({ games: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const games = await chesscomGamesSince("magnuscarlsen", Date.UTC(1999, 0, 1), 200);
  assert.deepEqual(games, []);
  assert.ok(fetched.length <= 6, `expected <= 6 archive fetches, got ${fetched.length}`);
  assert.deepEqual(fetched, archives.slice(-6).reverse());
});

test("chesscomGames throws NoPublicGamesError on a 404 archives response", async (t) => {
  mockFetch(t, (url) => {
    if (url.includes("/games/archives")) {
      return new Response("not found", { status: 404 });
    }
    return null;
  });

  await assert.rejects(
    async () => {
      await chesscomGames("nope-unknown-user");
    },
    (err: unknown) => err instanceof NoPublicGamesError,
  );
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

test("searchChesscom runs candidates at concurrency 2", async (t) => {
  // "Magnus Carlsen" yields several candidates; each hangs ~40ms so a
  // sequential run would take 4x that while concurrency-2 takes ~2 waves.
  let inFlight = 0;
  let maxInFlight = 0;
  mockFetch(t, async (url) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((resolve) => setTimeout(resolve, 40));
      const username = url.split("/").at(-1) ?? "unknown";
      return new Response(JSON.stringify({ username, name: "Test User" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      inFlight -= 1;
    }
  });
  const t0 = Date.now();
  const hits = await searchChesscom("Magnus Carlsen");
  const elapsed = Date.now() - t0;
  assert.equal(maxInFlight, 2);
  assert.ok(hits.length >= 2, `expected several hits, got ${hits.length}`);
  assert.ok(elapsed < 40 * 4, `expected parallel waves, took ${elapsed}ms`);
});

test("searchChesscom de-duplicates usernames keeping candidate order", async (t) => {
  mockFetch(t, () => {
    // Every candidate URL resolves to the same Chess.com username.
    return new Response(JSON.stringify({ username: "magnuscarlsen", name: "Magnus Carlsen" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const hits = await searchChesscom("Magnus Carlsen");
  assert.ok(hits.length >= 1, "at least one hit");
  assert.deepEqual(
    hits.map((hit) => hit.username.toLowerCase()),
    ["magnuscarlsen"],
  );
  assert.equal(hits[0]?.id, "chesscom:magnuscarlsen");
});

test("searchChesscom returns [] when every candidate 404s", async (t) => {
  mockFetch(t, () => new Response("not found", { status: 404 }));
  assert.deepEqual(await searchChesscom("Magnus Carlsen"), []);
});

test("searchChesscom keeps going when one candidate throws", async (t) => {
  mockFetch(t, (url) => {
    if (url.toLowerCase().endsWith("/magnuscarlsen")) {
      throw new Error("network down");
    }
    const username = url.split("/").at(-1) ?? "other";
    return new Response(JSON.stringify({ username, name: "Other User" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const hits = await searchChesscom("Magnus Carlsen");
  assert.ok(hits.length >= 1, "other candidates still resolve");
});

