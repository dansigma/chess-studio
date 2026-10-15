// Tests for the players/search API route: query validation, upstream
// pass-through, error fallback, and rate limiting
// (see `.artifacts/plans/issue-932.md` Phase 3).
import test from "node:test";
import assert from "node:assert/strict";
import {
  makeGetRequest,
  mockPlayersServer,
  nextTestIp,
} from "@/src/test-utils/route-test.ts";

const stubs: { searchPlayers?: (query: string) => Promise<unknown> } = {};
mockPlayersServer(stubs);

const { GET } = await import("./route.ts");

const BASE = "http://app.test/api/players/search";

async function get(query: string, ip = nextTestIp()) {
  const res = await GET(makeGetRequest(`${BASE}${query}`, ip));
  const body = (await res.json()) as unknown;
  return { res, body };
}

test("missing q returns an empty list", async () => {
  stubs.searchPlayers = async () => {
    throw new Error("must not call upstream for invalid queries");
  };
  const { res, body } = await get("");
  assert.equal(res.status, 200);
  assert.deepEqual(body, { players: [] });
});

test("short q returns an empty list", async () => {
  const { body } = await get("?q=x");
  assert.deepEqual(body, { players: [] });
});

test("valid q passes through upstream players", async () => {
  const players = [{ id: "1", username: "hikaru", source: "lichess" }];
  stubs.searchPlayers = async (query: string) => {
    assert.equal(query, "hikaru");
    return players;
  };
  const { res, body } = await get("?q=hikaru");
  assert.equal(res.status, 200);
  assert.deepEqual(body, { players });
});

test("upstream failure returns an empty list", async () => {
  stubs.searchPlayers = async () => {
    throw new Error("upstream down");
  };
  const { res, body } = await get("?q=hikaru");
  assert.equal(res.status, 200);
  assert.deepEqual(body, { players: [] });
});

test("rate-limits after 60 requests from one IP", async () => {
  stubs.searchPlayers = async () => [];
  const ip = nextTestIp();
  let last = 0;
  for (let i = 0; i < 61; i += 1) {
    const { res } = await get("?q=hikaru", ip);
    last = res.status;
  }
  assert.equal(last, 429);
});
