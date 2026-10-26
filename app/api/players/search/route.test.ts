// Tests for the players/search API route: query validation, partial/failed
// sources, the short result cache, error fallback, and rate limiting
// (SIG-1086; originally see `.artifacts/plans/issue-932.md` Phase 3).
import test from "node:test";
import assert from "node:assert/strict";
import {
  makeGetRequest,
  mockPlayersServer,
  nextTestIp,
} from "@/src/test-utils/route-test.ts";

const stubs: { searchPlayers?: (query: string) => Promise<unknown> } = {};
mockPlayersServer(stubs);

const { GET, __clearSearchCacheForTests } = await import("./route.ts");

const BASE = "http://app.test/api/players/search";

async function get(query: string, ip = nextTestIp()) {
  const res = await GET(makeGetRequest(`${BASE}${query}`, ip));
  const body = (await res.json()) as unknown;
  return { res, body };
}

let queryCounter = 0;
function uniqueQuery(): string {
  queryCounter += 1;
  return `cacheprobe${queryCounter}`;
}

test("missing q returns 400 without calling upstream", async () => {
  stubs.searchPlayers = async () => {
    throw new Error("must not call upstream for invalid queries");
  };
  const { res, body } = await get("");
  assert.equal(res.status, 400);
  assert.deepEqual(body, { error: "A search query of 2 to 40 characters is required" });
});

test("short q returns 400", async () => {
  const { res, body } = await get("?q=x");
  assert.equal(res.status, 400);
  assert.deepEqual(body, { error: "A search query of 2 to 40 characters is required" });
});

test("valid q passes through upstream players with partial false", async () => {
  const q = uniqueQuery();
  const players = [{ id: "1", username: "hikaru", source: "lichess" }];
  stubs.searchPlayers = async (query: string) => {
    assert.equal(query, q);
    return { players, failedSources: [] };
  };
  const { res, body } = await get(`?q=${q}`);
  assert.equal(res.status, 200);
  assert.deepEqual(body, { players, partial: false });
});

test("one failed source returns 200 with partial true", async () => {
  const q = uniqueQuery();
  const players = [{ id: "1", username: "hikaru", source: "lichess" }];
  stubs.searchPlayers = async () => ({ players, failedSources: ["chesscom"] });
  const { res, body } = await get(`?q=${q}`);
  assert.equal(res.status, 200);
  assert.deepEqual(body, { players, partial: true });
});

test("all sources failed returns 502", async () => {
  const q = uniqueQuery();
  stubs.searchPlayers = async () => ({
    players: [],
    failedSources: ["lichess", "chesscom", "studio"],
  });
  const { res, body } = await get(`?q=${q}`);
  assert.equal(res.status, 502);
  assert.deepEqual(body, { error: "Player search is temporarily unavailable" });
});

test("unexpected throw returns an empty list", async () => {
  const q = uniqueQuery();
  stubs.searchPlayers = async () => {
    throw new Error("upstream down");
  };
  const { res, body } = await get(`?q=${q}`);
  assert.equal(res.status, 200);
  assert.deepEqual(body, { players: [] });
});

test("repeated query is served from the cache", async () => {
  const q = uniqueQuery();
  const players = [{ id: "1", username: "hikaru", source: "lichess" }];
  let calls = 0;
  stubs.searchPlayers = async () => {
    calls += 1;
    return { players, failedSources: [] };
  };
  const first = await get(`?q=${q}`);
  assert.equal(first.res.status, 200);
  const second = await get(`?q=${q}`);
  assert.equal(second.res.status, 200);
  assert.deepEqual(second.body, { players, partial: false });
  assert.equal(calls, 1);
});

test("cache key is case-insensitive and trimmed", async () => {
  const q = uniqueQuery();
  const players = [{ id: "1", username: "hikaru", source: "lichess" }];
  let calls = 0;
  stubs.searchPlayers = async () => {
    calls += 1;
    return { players, failedSources: [] };
  };
  await get(`?q=${q}`);
  const { res, body } = await get(`?q=%20${q.toUpperCase()}%20`);
  assert.equal(res.status, 200);
  assert.deepEqual(body, { players, partial: false });
  assert.equal(calls, 1);
});

test("cache entry expires after 60 seconds", async (t) => {
  const q = uniqueQuery();
  const players = [{ id: "1", username: "hikaru", source: "lichess" }];
  let calls = 0;
  stubs.searchPlayers = async () => {
    calls += 1;
    return { players, failedSources: [] };
  };
  const realNow = Date.now;
  try {
    let now = 1_700_000_000_000;
    t.mock.method(Date, "now", () => now);
    await get(`?q=${q}`);
    now += 59_000;
    await get(`?q=${q}`);
    assert.equal(calls, 1);
    now += 2_000;
    const { res } = await get(`?q=${q}`);
    assert.equal(res.status, 200);
    assert.equal(calls, 2);
  } finally {
    Date.now = realNow;
    __clearSearchCacheForTests();
  }
});

test("rate-limits after 60 requests from one IP", async () => {
  stubs.searchPlayers = async () => ({ players: [], failedSources: [] });
  const ip = nextTestIp();
  let last = 0;
  for (let i = 0; i < 61; i += 1) {
    const { res } = await get(`?q=${uniqueQuery()}`, ip);
    last = res.status;
  }
  assert.equal(last, 429);
});
