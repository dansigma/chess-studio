// Tests for the players/games API route: source/username validation,
// upstream pass-through with cache headers, error mapping, and rate limiting
// (see `.artifacts/plans/issue-932.md` Phase 3).
import test from "node:test";
import assert from "node:assert/strict";
import {
  makeGetRequest,
  mockPlayersServer,
  nextTestIp,
} from "@/src/test-utils/route-test.ts";

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

const BASE = "http://app.test/api/players/games";

async function get(query: string, ip = nextTestIp()) {
  const res = await GET(makeGetRequest(`${BASE}${query}`, ip));
  const body = (await res.json()) as unknown;
  return { res, body };
}

test("invalid source returns 400", async () => {
  stubs.loadPlayerGames = async () => {
    throw new Error("must not call upstream for invalid sources");
  };
  const { res, body } = await get("?source=nope&username=hikaru");
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

test("valid request passes through games with a private cache header", async () => {
  const payload = { games: [{ id: "g1" }], player: { username: "hikaru" } };
  const seen: Array<{ source: string; username: string; display?: string; subtitle?: string }> = [];
  stubs.loadPlayerGames = async (source, username, displayName, subtitle) => {
    seen.push({ source, username, display: displayName, subtitle });
    return payload;
  };
  const { res, body } = await get(
    "?source=lichess&username=hikaru&displayName=Hikaru&subtitle=GM",
  );
  assert.equal(res.status, 200);
  assert.deepEqual(body, payload);
  assert.deepEqual(seen, [
    { source: "lichess", username: "hikaru", display: "Hikaru", subtitle: "GM" },
  ]);
  assert.equal(res.headers.get("Cache-Control"), "private, max-age=60");
});

test("studio source accepts display-style names", async () => {
  stubs.loadPlayerGames = async () => ({ games: [] });
  const { res } = await get("?source=studio&username=Club%20Night%20Player");
  assert.equal(res.status, 200);
});

test("upstream failure returns 400", async () => {
  stubs.loadPlayerGames = async () => {
    throw new Error("upstream down");
  };
  const { res, body } = await get("?source=lichess&username=hikaru");
  assert.equal(res.status, 400);
  assert.deepEqual(body, { error: "Could not load games" });
});

test("rate-limits after 30 requests from one IP", async () => {
  stubs.loadPlayerGames = async () => ({ games: [] });
  const ip = nextTestIp();
  let last = 0;
  for (let i = 0; i < 31; i += 1) {
    const { res } = await get("?source=lichess&username=hikaru", ip);
    last = res.status;
  }
  assert.equal(last, 429);
});
