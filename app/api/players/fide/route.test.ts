// Tests for the players/fide API route: query validation, upstream
// pass-through, error fallback, and rate limiting
// (see `.artifacts/plans/issue-932.md` Phase 3).
import test from "node:test";
import assert from "node:assert/strict";
import {
  makeGetRequest,
  mockPlayersServer,
  nextTestIp,
} from "@/src/test-utils/route-test.ts";

const stubs: { searchFidePlayers?: (query: string) => Promise<unknown> } = {};
mockPlayersServer(stubs);

const { GET } = await import("./route.ts");

const BASE = "http://app.test/api/players/fide";

async function get(query: string, ip = nextTestIp()) {
  const res = await GET(makeGetRequest(`${BASE}${query}`, ip));
  const body = (await res.json()) as unknown;
  return { res, body };
}

test("missing q returns an empty list", async () => {
  stubs.searchFidePlayers = async () => {
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
  const players = [{ id: "fide-1", username: "Carlsen, Magnus", rating: 2830 }];
  stubs.searchFidePlayers = async (query: string) => {
    assert.equal(query, "carlsen");
    return players;
  };
  const { res, body } = await get("?q=carlsen");
  assert.equal(res.status, 200);
  assert.deepEqual(body, { players });
});

test("upstream failure returns an empty list", async () => {
  stubs.searchFidePlayers = async () => {
    throw new Error("upstream down");
  };
  const { res, body } = await get("?q=carlsen");
  assert.equal(res.status, 200);
  assert.deepEqual(body, { players: [] });
});

test("rate-limits after 60 requests from one IP", async () => {
  stubs.searchFidePlayers = async () => [];
  const ip = nextTestIp();
  let last = 0;
  for (let i = 0; i < 61; i += 1) {
    const { res } = await get("?q=carlsen", ip);
    last = res.status;
  }
  assert.equal(last, 429);
});
