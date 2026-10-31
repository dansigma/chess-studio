// Tests for the prep/opponent API route: source/username validation, the
// 404/502 mappings, profile pass-through with the public cache header, and
// rate limiting (see `.artifacts/plans/issue-SIG-1100.md` Phase 2).
import test from "node:test";
import assert from "node:assert/strict";
import {
  makeGetRequest,
  mockPlayersServer,
  nextTestIp,
} from "@/src/test-utils/route-test.ts";
import { buildOpponentProfile } from "@/src/lib/prep/opponent-profile.ts";
import { NoPublicGamesError } from "@/src/lib/players/shared.ts";
import type { PlayerGame } from "@/src/lib/player-types.ts";

const stubs: {
  loadPlayerGames?: (
    source: string,
    username: string,
    displayName?: string,
    subtitle?: string,
  ) => Promise<unknown>;
} = {};
mockPlayersServer(stubs);

const { GET } = await import("./route.ts");

const BASE = "http://app.test/api/prep/opponent";

async function get(query: string, ip = nextTestIp()) {
  const res = await GET(makeGetRequest(`${BASE}${query}`, ip));
  const body = (await res.json()) as unknown;
  return { res, body };
}

function game(overrides: Partial<PlayerGame> & Pick<PlayerGame, "color" | "playerResult">): PlayerGame {
  return {
    id: `g-${overrides.color}-${overrides.moves ?? overrides.pgn ?? "empty"}`,
    winner: null,
    whiteName: "rival",
    whiteRating: 1500,
    blackName: "opp",
    blackRating: 1500,
    year: 2026,
    month: 10,
    event: "Lichess",
    eco: null,
    opening: null,
    playedAt: Date.UTC(2026, 9, 31, 12, 0, 0, 0),
    timeClass: "blitz",
    rated: true,
    ...overrides,
  };
}

test("invalid source returns 400 without calling upstream", async () => {
  stubs.loadPlayerGames = async () => {
    throw new Error("must not call upstream for invalid sources");
  };
  const { res, body } = await get("?source=nope&username=rival");
  assert.equal(res.status, 400);
  assert.deepEqual(body, { error: "source and a valid username are required" });
});

test("studio source returns 400 without calling upstream", async () => {
  stubs.loadPlayerGames = async () => {
    throw new Error("must not call upstream for the studio source");
  };
  const { res, body } = await get("?source=studio&username=Club%20Night%20Player");
  assert.equal(res.status, 400);
  assert.deepEqual(body, { error: "source and a valid username are required" });
});

test("missing username returns 400", async () => {
  const { res } = await get("?source=lichess");
  assert.equal(res.status, 400);
});

test("bad username returns 400", async () => {
  const { res } = await get("?source=lichess&username=bad%20name!!");
  assert.equal(res.status, 400);
});

test("account with no public games returns 404", async () => {
  stubs.loadPlayerGames = async () => ({ player: { username: "rival" }, games: [], truncated: false });
  const { res, body } = await get("?source=lichess&username=rival");
  assert.equal(res.status, 404);
  assert.deepEqual(body, { error: "No public games found for this account" });
});

test("loader rejecting with NoPublicGamesError returns 404", async () => {
  stubs.loadPlayerGames = async () => {
    throw new NoPublicGamesError("No public games for this Lichess account.");
  };
  const { res, body } = await get("?source=lichess&username=Hikaru");
  assert.equal(res.status, 404);
  assert.deepEqual(body, { error: "No public games found for this account" });
});

test("upstream failure returns 502", async () => {
  stubs.loadPlayerGames = async () => {
    throw new Error("upstream down");
  };
  const { res, body } = await get("?source=chesscom&username=rival");
  assert.equal(res.status, 502);
  assert.deepEqual(body, { error: "Could not load games" });
});

test("valid request returns the profile with a public cache header", async () => {
  const games: PlayerGame[] = [
    game({ color: "white", moves: "e4 e5 Nf3", playerResult: "win" }),
    game({ color: "white", moves: "d4 d5 c4", playerResult: "draw" }),
    game({ color: "black", moves: "e4 c5", playerResult: "loss" }),
  ];
  const seen: Array<{ source: string; username: string }> = [];
  stubs.loadPlayerGames = async (source, username) => {
    seen.push({ source, username });
    return { player: { username: "rival" }, games, truncated: false };
  };
  const { res, body } = await get("?source=lichess&username=rival");
  assert.equal(res.status, 200);
  assert.deepEqual(body, buildOpponentProfile(games));
  assert.deepEqual(seen, [{ source: "lichess", username: "rival" }]);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=120");
});

test("rate-limits after 20 requests from one IP", async () => {
  stubs.loadPlayerGames = async () => ({ player: { username: "rival" }, games: [] });
  const ip = nextTestIp();
  let last = 0;
  let retryAfter: string | null = null;
  for (let i = 0; i < 21; i += 1) {
    const { res } = await get("?source=lichess&username=rival", ip);
    last = res.status;
    retryAfter = res.headers.get("Retry-After");
  }
  assert.equal(last, 429);
  assert.ok(retryAfter);
});
