// SIG-1225: POST /api/explorer/book: validation, rate limit, cache, upstream
// walk, and the failure modes the client turns into "book unavailable".
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "@/src/test-utils/stubs/next-server.ts";
import {
  createFakeSupabase,
  jsonResponse,
  mockFetch,
  mockSupabaseModules,
  nextTestIp,
  type FakeSupabaseState,
} from "@/src/test-utils/route-test.ts";

const state: FakeSupabaseState = {};
mockSupabaseModules(state);

const { POST, _resetBookStateForTest } = await import("./route.ts");

const URL_ = "http://app.test/api/explorer/book";
const GAME = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"];

function post(body: unknown, ip = nextTestIp()) {
  return new NextRequest(URL_, {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const savedToken = process.env.LICHESS_TOKEN;
beforeEach(() => {
  _resetBookStateForTest();
  state.public = null;
  state.service = null;
  process.env.LICHESS_TOKEN = "test-token";
});
test.after(() => {
  if (savedToken === undefined) delete process.env.LICHESS_TOKEN;
  else process.env.LICHESS_TOKEN = savedToken;
});

/** Upstream that knows `playable` moves per ply: each position has 1000 games, the game's move has `games`. */
function upstream(ucis: string[], gamesAt: (ply: number) => number, seen: string[] = []) {
  return (url: string) => {
    if (!url.includes("explorer.lichess.ovh/lichess")) return null;
    seen.push(url);
    const ply = seen.length - 1;
    return jsonResponse({
      white: 400,
      draws: 200,
      black: 400,
      moves: [{ uci: ucis[ply], white: gamesAt(ply), draws: 0, black: 0 }],
    });
  };
}

test("rejects bad bodies and illegal moves", async () => {
  assert.equal((await POST(post("not json"))).status, 400);
  assert.equal((await POST(post({ moves: [] }))).status, 400);
  assert.equal((await POST(post({ moves: ["e2e4", 5] }))).status, 400);
  assert.equal((await POST(post({ moves: ["e2-e4"] }))).status, 400);
  assert.equal((await POST(post({ moves: Array(121).fill("e2e4") }))).status, 400);
  assert.equal((await POST(post({ moves: ["e2e5"] }))).status, 400, "illegal from the standard start");
});

test("walks the explorer with the lichess filters and the token, once per ply, and stops at the first failing move", async (t) => {
  const seen: string[] = [];
  const headers: Array<HeadersInit | undefined> = [];
  mockFetch(t, (url, init) => {
    headers.push(init?.headers);
    return upstream(GAME, (ply) => (ply < 3 ? 500 : 5), seen)(url);
  });
  const res = await POST(post({ moves: GAME }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { available: boolean; plies: number; partial: boolean; counts: unknown[] };
  assert.equal(body.available, true);
  assert.equal(body.plies, 3);
  assert.equal(body.partial, false);
  assert.equal(body.counts.length, 4);
  assert.equal(seen.length, 4, "stops at the first failing move");
  assert.ok(seen.every((url) => url.includes("ratings=2200,2500") && url.includes("speeds=blitz,rapid,classical")));
  assert.ok(headers.every((h) => (h as Record<string, string>).Authorization === "Bearer test-token"));
});

test("an explorer failure on the first position answers available: false", async (t) => {
  mockFetch(t, () => new Response("slow down", { status: 429 }));
  const body = (await (await POST(post({ moves: GAME }))).json()) as { available: boolean; plies: number };
  assert.deepEqual({ available: body.available, plies: body.plies }, { available: false, plies: 0 });
});

test("no server token answers available: false without calling the explorer", async (t) => {
  delete process.env.LICHESS_TOKEN;
  delete process.env.LICHESS_API_TOKEN;
  mockFetch(t, () => {
    throw new Error("must not fetch");
  });
  const body = (await (await POST(post({ moves: GAME }))).json()) as { available: boolean };
  assert.equal(body.available, false);
});

test("a failure after some book moves keeps those moves and says partial", async (t) => {
  let calls = 0;
  const good = upstream(GAME, () => 500);
  mockFetch(t, (url) => {
    calls += 1;
    return calls <= 2 ? good(url) : new Response("boom", { status: 500 });
  });
  const body = (await (await POST(post({ moves: GAME }))).json()) as { plies: number; partial: boolean };
  assert.equal(body.partial, true);
  assert.equal(body.plies, 2);
});

test("positions come from explorer_cache under the book source and are written back with the service client", async (t) => {
  const fake = createFakeSupabase({ tables: { explorer_cache: {} } });
  state.public = fake;
  state.service = fake;
  const good = upstream(GAME, () => 500);
  mockFetch(t, (url) => good(url));
  await POST(post({ moves: GAME.slice(0, 2) }));
  const writes = fake.calls.upsert.filter((entry) => entry.table === "explorer_cache");
  assert.equal(writes.length, 2);
  for (const write of writes) {
    const row = write.row as { source: string };
    assert.ok(row.source.startsWith("lichess-book-v1-"));
    assert.notEqual(row.source, "lichess");
  }
});

test("a cached position is used without calling the explorer", async (t) => {
  const fake = createFakeSupabase({
    tables: { explorer_cache: { maybeSingle: { payload: { total: 900, moves: [{ uci: "e2e4", games: 500 }] }, fetched_at: "x" } } },
  });
  state.public = fake;
  mockFetch(t, () => {
    throw new Error("must not fetch");
  });
  const body = (await (await POST(post({ moves: ["e2e4"] }))).json()) as { plies: number; available: boolean };
  assert.deepEqual({ plies: body.plies, available: body.available }, { plies: 1, available: true });
});

test("rate limits one client", async (t) => {
  mockFetch(t, () => new Response("x", { status: 500 }));
  const ip = nextTestIp();
  let last = 0;
  for (let i = 0; i < 25; i += 1) {
    last = (await POST(post({ moves: ["e2e4"] }, ip))).status;
  }
  assert.equal(last, 429);
});
