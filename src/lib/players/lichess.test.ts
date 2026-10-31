import assert from "node:assert/strict";
import test from "node:test";
import { hitFromLichessUser, lichessGames, lichessGamesSince, lichessWinner } from "./lichess.ts";
import { mockFetch } from "@/src/test-utils/route-test.ts";
import { UpstreamPayloadTooLargeError } from "../read-capped.ts";

test("hitFromLichessUser builds a Lichess hit with a title", () => {
  const hit = hitFromLichessUser({ id: "DrNykterstein", name: "Magnus Carlsen", title: "GM" }, "fallback");
  assert.deepEqual(hit, {
    id: "lichess:DrNykterstein",
    source: "lichess",
    username: "DrNykterstein",
    displayName: "GM Magnus Carlsen",
    subtitle: "Lichess",
    title: "GM",
  });
});

test("hitFromLichessUser falls back to the query when the payload has no names", () => {
  const hit = hitFromLichessUser({}, "Hikaru");
  assert.equal(hit?.username, "Hikaru");
  assert.equal(hit?.displayName, "Hikaru");
});

test("hitFromLichessUser returns null for closed or empty accounts", () => {
  assert.equal(hitFromLichessUser({ id: "someone", disabled: true }, "someone"), null);
  assert.equal(hitFromLichessUser({}, ""), null);
});

test("lichessWinner prefers the declared winner then draw statuses", () => {
  assert.equal(lichessWinner({ winner: "white" }), "white");
  assert.equal(lichessWinner({ winner: "black" }), "black");
  assert.equal(lichessWinner({ status: "draw" }), "draw");
  assert.equal(lichessWinner({ status: "stalemate" }), "draw");
  assert.equal(lichessWinner({ status: "started" }), null);
});

test("lichessGames skips malformed NDJSON lines and returns valid games", async (t) => {
  const g1 = {
    id: "game1",
    createdAt: 1700000000000,
    speed: "blitz",
    players: {
      white: { user: { name: "Magnus", id: "drnykterstein" }, rating: 2800 },
      black: { user: { name: "Hikaru", id: "hikaru" }, rating: 2800 },
    },
    winner: "white",
  };
  const g2 = {
    id: "game2",
    createdAt: 1700001000000,
    speed: "rapid",
    players: {
      white: { user: { name: "Hikaru", id: "hikaru" }, rating: 2800 },
      black: { user: { name: "Magnus", id: "drnykterstein" }, rating: 2800 },
    },
    winner: "black",
  };

  mockFetch(t, (url) => {
    if (url.includes("api/games/user/hikaru")) {
      const ndjson = [
        JSON.stringify(g1),
        "MALFORMED_NON_JSON_LINE",
        JSON.stringify(g2),
        "",
      ].join("\n");
      return new Response(ndjson, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
    }
    return null;
  });

  const games = await lichessGames("hikaru");
  assert.equal(games.length, 2);
  assert.equal(games[0].id, "game1");
  assert.equal(games[1].id, "game2");
});

test("lichessGames maps rated and speed to rated and timeClass", async (t) => {
  mockFetch(t, (url) => {
    if (url.includes("api/games/user/hikaru")) {
      const ndjson = [
        JSON.stringify({
          id: "rated1",
          createdAt: 1700000000000,
          rated: true,
          speed: "blitz",
          moves: "e4 e5",
          players: {
            white: { user: { name: "Hikaru", id: "hikaru" }, rating: 2800 },
            black: { user: { name: "Magnus", id: "drnykterstein" }, rating: 2850 },
          },
          winner: "white",
        }),
        JSON.stringify({
          id: "unrated1",
          createdAt: 1700001000000,
          moves: "d4 d5",
          players: {
            white: { user: { name: "Magnus", id: "drnykterstein" }, rating: 2850 },
            black: { user: { name: "Hikaru", id: "hikaru" }, rating: 2800 },
          },
          winner: "black",
        }),
      ].join("\n");
      return new Response(ndjson, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
    }
    return null;
  });

  const games = await lichessGames("hikaru");
  assert.equal(games[0]?.rated, true);
  assert.equal(games[0]?.timeClass, "blitz");
  assert.equal(games[1]?.rated, null);
  assert.equal(games[1]?.timeClass, null);
});

test("lichessGamesSince sends since and max params", async (t) => {
  const seen: string[] = [];
  mockFetch(t, (url) => {
    if (url.includes("api/games/user/hikaru")) {
      seen.push(url);
      return new Response("", { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
    }
    return null;
  });

  await lichessGamesSince("hikaru", 1_700_000_000_000, 200);
  assert.equal(seen.length, 1);
  const params = new URL(seen[0] ?? "").searchParams;
  assert.equal(params.get("since"), "1700000000000");
  assert.equal(params.get("max"), "200");
});

test("lichessGamesSince omits since when sinceMs is zero", async (t) => {
  const seen: string[] = [];
  mockFetch(t, (url) => {
    if (url.includes("api/games/user/hikaru")) {
      seen.push(url);
      return new Response("", { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
    }
    return null;
  });

  await lichessGamesSince("hikaru", 0, 80);
  assert.equal(seen.length, 1);
  const params = new URL(seen[0] ?? "").searchParams;
  assert.equal(params.get("since"), null);
  assert.equal(params.get("max"), "80");
});

test("lichessGames throws UpstreamPayloadTooLargeError when response exceeds cap", async (t) => {
  mockFetch(t, (url) => {
    if (url.includes("api/games/user/hikaru")) {
      return new Response("x".repeat(2 * 1024 * 1024 + 100), {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      });
    }
    return null;
  });

  await assert.rejects(
    async () => {
      await lichessGames("hikaru");
    },
    (err: unknown) => err instanceof UpstreamPayloadTooLargeError,
  );
});

