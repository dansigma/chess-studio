import assert from "node:assert/strict";
import test from "node:test";
import {
  chesscomGames,
  chesscomGamesSince,
  chesscomGamesSinceDetailed,
  chesscomOpeningNameFromUrl,
  chesscomWinner,
  compactChesscomGame,
  searchChesscom,
} from "./chesscom.ts";
import { mockFetch } from "@/src/test-utils/route-test.ts";
import { UpstreamPayloadTooLargeError } from "../read-capped.ts";
import { NoPublicGamesError, UA } from "./shared.ts";

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
      pgn: '[Event "Live Chess"]\n[ECO "C50"]\n[ECOUrl "https://www.chess.com/openings/Italian-Game-Giuoco-Piano-3...Bc5"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0',
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
  assert.equal(game.opening, "Italian Game Giuoco Piano");
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

test("searchChesscom runs candidates serially (Chess.com 429s parallel requests)", async (t) => {
  let inFlight = 0;
  let maxInFlight = 0;
  mockFetch(t, async (url) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const username = url.split("/").at(-1) ?? "unknown";
      return new Response(JSON.stringify({ username, name: "Test User" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      inFlight -= 1;
    }
  });
  const hits = await searchChesscom("Magnus Carlsen");
  assert.equal(maxInFlight, 1);
  assert.ok(hits.length >= 2, `expected several hits, got ${hits.length}`);
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


// Real header lines from a hikaru/skillfulness game (SIG-1210).
const REAL_PGN = [
  '[Event "Live Chess"]',
  '[Site "Chess.com"]',
  '[ECO "A40"]',
  '[ECOUrl "https://www.chess.com/openings/Queens-Pawn-Opening-1...c6"]',
  "",
  "1. d4 c6 2. c4 d5 1-0",
].join("\n");

test("compactChesscomGame maps ECO from the PGN header and the opening name from the ECOUrl", () => {
  const game = compactChesscomGame(
    {
      url: "https://www.chess.com/game/live/42",
      end_time: 1_600_000_000,
      // Chess.com puts the ECOUrl (not a code) in `eco`.
      eco: "https://www.chess.com/openings/Queens-Pawn-Opening-1...c6",
      pgn: REAL_PGN,
      white: { username: "skillfulness", result: "win" },
      black: { username: "b", result: "resigned" },
    },
    "skillfulness",
    0,
  );
  assert.equal(game.eco, "A40");
  assert.equal(game.opening, "Queen's Pawn Opening");
});

test("compactChesscomGame never leaks the URL into eco; falls back to raw.eco URL for the name", () => {
  const game = compactChesscomGame(
    {
      url: "https://www.chess.com/game/live/43",
      end_time: 1_600_000_000,
      eco: "https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation-6.Bg5",
      pgn: '[Event "x"]\n\n1. e4 c5 1-0',
      white: { username: "a", result: "win" },
      black: { username: "b", result: "resigned" },
    },
    "a",
    0,
  );
  assert.equal(game.eco, null);
  assert.equal(game.opening, "Sicilian Defense Najdorf Variation");
  const bare = compactChesscomGame({ end_time: 1, white: { username: "a" }, black: { username: "b" } }, "a", 0);
  assert.equal(bare.eco, null);
  assert.equal(bare.opening, null);
});

test("chesscomOpeningNameFromUrl cuts the move suffix and tidies the slug", () => {
  const base = "https://www.chess.com/openings/";
  assert.equal(chesscomOpeningNameFromUrl(`${base}Queens-Pawn-Opening-1...c6`), "Queen's Pawn Opening");
  assert.equal(
    chesscomOpeningNameFromUrl(`${base}Sicilian-Defense-Najdorf-Variation-6.Bg5`),
    "Sicilian Defense Najdorf Variation",
  );
  assert.equal(chesscomOpeningNameFromUrl(`${base}Kings-Gambit-Accepted-2.Nf3`), "King's Gambit Accepted");
  assert.equal(chesscomOpeningNameFromUrl(`${base}Kings-Indian-Defense`), "King's Indian Defense");
  assert.equal(chesscomOpeningNameFromUrl(`${base}Italian-Game`), "Italian Game");
  assert.equal(chesscomOpeningNameFromUrl(`${base}Italian-Game?x=1`), "Italian Game");
  assert.equal(chesscomOpeningNameFromUrl("A40"), null);
  assert.equal(chesscomOpeningNameFromUrl(null), null);
  assert.equal(chesscomOpeningNameFromUrl(`${base}`), null);
});

test("requests identify as XadrezDigital", () => {
  assert.equal(UA, "XadrezDigital/1.0 (+https://xadrez.digital)");
});

function syntheticGame(index: number): Record<string, unknown> {
  // ~1 KB PGN with braces in a comment and a non-ASCII player name.
  const moves = Array.from({ length: 40 }, (_, i) => `${i + 1}. e4 {[%clk 0:03:00] } } {` + `${index}} e5`).join(" ");
  return {
    url: `https://www.chess.com/game/live/${index}`,
    end_time: 1_760_000_000 + index,
    time_class: "bullet",
    rated: true,
    eco: "https://www.chess.com/openings/Queens-Pawn-Opening-1...c6",
    pgn: `[Event "Live Chess"]\n[ECO "A40"]\n[ECOUrl "https://www.chess.com/openings/Queens-Pawn-Opening-1...c6"]\n\n${moves} 1-0`,
    white: { username: "Hikarü", rating: 3200, result: "win" },
    black: { username: `opp${index}`, rating: 3000, result: "resigned" },
  };
}

function chunkedBody(text: string, chunkBytes: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkBytes));
      offset += chunkBytes;
    },
  });
}

test("chesscomGamesSince streams a ~3 MB month in small chunks and returns only the newest N", async (t) => {
  const archive = "https://api.chess.com/pub/player/hikaru/games/2026/10";
  const payload = JSON.stringify({ games: Array.from({ length: 3000 }, (_, i) => syntheticGame(i)) });
  assert.ok(payload.length > 2 * 1024 * 1024, `fixture should exceed the old 2 MB cap, got ${payload.length}`);
  mockFetch(t, (url) => {
    if (url.includes("/games/archives")) {
      return new Response(JSON.stringify({ archives: [archive] }), { status: 200 });
    }
    return new Response(chunkedBody(payload, 997), { status: 200 });
  });
  const result = await chesscomGamesSinceDetailed("Hikaru", 0, 80);
  assert.equal(result.partial, false);
  assert.equal(result.games.length, 80);
  // Newest first: game 2999 down to 2920.
  assert.equal(result.games[0]?.id, "2999");
  assert.equal(result.games.at(-1)?.id, "2920");
  assert.equal(result.games[0]?.eco, "A40");
  assert.equal(result.games[0]?.opening, "Queen's Pawn Opening");
  assert.equal(result.games[0]?.whiteName, "Hikarü");
});

test("chesscomGamesSince with since keeps only newer games, bounded by the newest N", async (t) => {
  const archive = "https://api.chess.com/pub/player/hikaru/games/2026/10";
  const payload = JSON.stringify({ games: Array.from({ length: 500 }, (_, i) => syntheticGame(i)) });
  mockFetch(t, (url) => {
    if (url.includes("/games/archives")) {
      return new Response(JSON.stringify({ archives: [archive] }), { status: 200 });
    }
    return new Response(chunkedBody(payload, 4096), { status: 200 });
  });
  const sinceMs = (1_760_000_000 + 489) * 1000; // games 490..499 are newer
  const games = await chesscomGamesSince("hikaru", sinceMs, 200);
  assert.deepEqual(
    games.map((g) => g.id),
    ["499", "498", "497", "496", "495", "494", "493", "492", "491", "490"],
  );
  const capped = await chesscomGamesSince("hikaru", sinceMs, 3);
  assert.deepEqual(
    capped.map((g) => g.id),
    ["499", "498", "497"],
  );
});

test("chesscomGamesSince skips a failing month, warns, and still returns the other games", async (t) => {
  const archives = [
    "https://api.chess.com/pub/player/hikaru/games/2026/09",
    "https://api.chess.com/pub/player/hikaru/games/2026/10",
    "https://api.chess.com/pub/player/hikaru/games/2026/11",
  ];
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => {
    warnings.push(args);
  });
  mockFetch(t, (url) => {
    if (url.includes("/games/archives")) {
      return new Response(JSON.stringify({ archives }), { status: 200 });
    }
    if (url.includes("/games/2026/11")) {
      return new Response(JSON.stringify({ games: [syntheticGame(1), syntheticGame(2)] }), { status: 200 });
    }
    if (url.includes("/games/2026/10")) {
      return new Response('{"games":[{"url":"x","end_time":1},{"end', { status: 200 }); // cut off
    }
    return new Response(JSON.stringify({ games: [syntheticGame(0)] }), { status: 200 });
  });
  const result = await chesscomGamesSinceDetailed("hikaru", 0, 200);
  // cutoff-less walk is the newest two archives (11 and 10): 10 is skipped.
  assert.equal(result.partial, true);
  assert.deepEqual(
    result.games.map((g) => g.id),
    ["2", "1"],
  );
  assert.equal(warnings.length, 1);
  const detail = warnings[0]?.[1] as { source: string; username: string; url: string; reason: string };
  assert.equal(detail.source, "chesscom");
  assert.equal(detail.username, "hikaru");
  assert.equal(detail.url, archives[1]);
  assert.match(detail.reason, /JsonStreamError/);
});

test("chesscomGamesSince skips a month that responds with an HTTP error", async (t) => {
  t.mock.method(console, "warn", () => {});
  mockFetch(t, (url) => {
    if (url.includes("/games/archives")) {
      return new Response(
        JSON.stringify({ archives: ["https://api.chess.com/pub/player/hikaru/games/2026/10"] }),
        { status: 200 },
      );
    }
    return new Response("slow down", { status: 429 });
  });
  const result = await chesscomGamesSinceDetailed("hikaru", 0, 80);
  assert.deepEqual(result, { games: [], partial: true });
});

test("chesscomGamesSince skips a month whose fetch throws", async (t) => {
  t.mock.method(console, "warn", () => {});
  mockFetch(t, (url) => {
    if (url.includes("/games/archives")) {
      return new Response(
        JSON.stringify({ archives: ["https://api.chess.com/pub/player/hikaru/games/2026/10"] }),
        { status: 200 },
      );
    }
    throw new Error("network down");
  });
  const games = await chesscomGamesSince("hikaru", 0, 80);
  assert.deepEqual(games, []);
});

test("chesscomGamesSince still fails when the archives list itself fails", async (t) => {
  mockFetch(t, () => new Response("boom", { status: 500 }));
  await assert.rejects(chesscomGamesSince("hikaru", 0, 80), /archives request failed/);
});

test("compactChesscomGame keeps [%clk] and TimeControl in the stored PGN, moves stay SAN-only", () => {
  const game = compactChesscomGame(
    {
      url: "https://www.chess.com/game/live/9",
      end_time: 1_600_000_000,
      pgn: '[Event "Live Chess"]\n[TimeControl "600"]\n\n1. e4 {[%clk 0:09:58.2]} 1... e5 {[%clk 0:09:57]} 1-0',
      white: { username: "Alice", rating: 1500, result: "win" },
      black: { username: "Bob", rating: 1400, result: "checkmated" },
    },
    "alice",
    0,
  );
  assert.equal(game.moves, "e4 e5");
  assert.ok(game.pgn?.includes("{[%clk 0:09:58.2]}"));
  assert.ok(game.pgn?.includes('[TimeControl "600"]'));
});
