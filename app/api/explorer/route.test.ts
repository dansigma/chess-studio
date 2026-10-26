// Tests for the explorer API route: validation, curated book, Supabase cache,
// live Lichess fallback, filter forwarding, offline notice, and rate limiting
// (see `.artifacts/plans/issue-932.md` Phase 3).
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createFakeSupabase,
  jsonResponse,
  makeGetRequest,
  mockFetch,
  mockSupabaseModules,
  nextTestIp,
  type FakeSupabaseState,
} from "@/src/test-utils/route-test.ts";

const state: FakeSupabaseState = {};
mockSupabaseModules(state);

const { GET, _resetExplorerStateForTest } = await import("./route.ts");

beforeEach(() => {
  _resetExplorerStateForTest();
});

const BASE = "http://app.test/api/explorer";
const STARTPOS = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FRENCH = "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
const ITALIAN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
const GIUOCO = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 2";
const PETROV = "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

function url(fen: string, source: string, extra = "") {
  return `${BASE}?fen=${encodeURIComponent(fen)}&source=${source}${extra}`;
}

async function get(fen: string, source: string, extra = "", ip = nextTestIp()) {
  const res = await GET(makeGetRequest(url(fen, source, extra), ip));
  const body = (await res.json()) as unknown;
  return { res, body };
}

test("requires fen and a valid source", async () => {
  const missing = await GET(makeGetRequest(`${BASE}?source=lichess`));
  assert.equal(missing.status, 400);
  assert.equal(missing.headers.get("Cache-Control"), null);
  const badSource = await get(STARTPOS, "chesscom");
  assert.equal(badSource.res.status, 400);
  assert.equal(badSource.res.headers.get("Cache-Control"), null);
  assert.deepEqual(badSource.body, { error: "fen and source=masters|lichess|curated are required" });
});

test("rejects an invalid fen", async () => {
  const { res, body } = await get("not-a-fen", "lichess");
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("Cache-Control"), null);
  assert.deepEqual(body, { error: "fen is not a valid position" });
});

test("serves curated positions from the embedded book", async () => {
  const { res, body } = await get(STARTPOS, "curated");
  assert.equal(res.status, 200);
  const payload = body as { source: string; fen: string; moves: unknown[] };
  assert.equal(payload.source, "curated");
  assert.equal(payload.fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
  assert.ok(payload.moves.length > 0);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600");
  assert.equal(res.headers.get("Set-Cookie"), null);
  assert.ok(!String(res.headers.get("Vary") ?? "").toLowerCase().includes("cookie"));
});

test("returns the Supabase cache hit without fetching", async (t) => {
  const cached = {
    source: "masters",
    fen: FRENCH,
    white: 3,
    draws: 1,
    black: 2,
    opening: null,
    moves: [],
    games: [],
  };
  state.public = createFakeSupabase({
    tables: { explorer_cache: { maybeSingle: { payload: cached, fetched_at: new Date().toISOString() } } },
  });
  state.service = createFakeSupabase();
  mockFetch(t, () => {
    assert.fail("cache hit must not fetch upstream");
  });
  const { res, body } = await get(FRENCH, "masters");
  assert.equal(res.status, 200);
  assert.deepEqual(body, cached);
  assert.equal(
    res.headers.get("Cache-Control"),
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  );
});

test("falls back to live Lichess on a cache miss and writes the cache through", async (t) => {
  state.public = createFakeSupabase();
  const service = createFakeSupabase();
  state.service = service;
  const live = {
    white: 10,
    draws: 5,
    black: 7,
    opening: { eco: "C50", name: "Italian Game" },
    moves: [{ san: "Nf3", uci: "g1f3", white: 4, draws: 2, black: 1, averageRating: 2400 }],
    topGames: [
      {
        id: "abc123",
        winner: "white",
        white: { name: "Carlsen", rating: 2830 },
        black: { name: "Nepo", rating: 2790 },
        year: 2021,
        month: 11,
      },
    ],
    recentGames: [
      {
        id: "abc123",
        winner: "white",
        white: { name: "Carlsen", rating: 2830 },
        black: { name: "Nepo", rating: 2790 },
        year: 2021,
        month: 11,
      },
    ],
  };
  mockFetch(t, (fetchUrl) => {
    assert.match(fetchUrl, /explorer\.lichess\.(ovh|org)\/lichess\?/);
    return jsonResponse(live);
  });
  const { res, body } = await get(ITALIAN, "lichess");
  assert.equal(res.status, 200);
  const payload = body as {
    source: string;
    white: number;
    moves: Array<{ san: string; games: number }>;
    games: Array<{ id: string; whiteName: string }>;
    opening: { eco: string };
  };
  assert.equal(payload.source, "lichess");
  assert.equal(payload.white, 10);
  assert.equal(payload.moves[0].games, 7);
  assert.equal(payload.games.length, 1);
  assert.equal(payload.games[0].whiteName, "Carlsen");
  assert.equal(payload.opening.eco, "C50");
  assert.equal(
    res.headers.get("Cache-Control"),
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  );
  const writes = service.calls.upsert.filter((call) => call.table === "explorer_cache");
  assert.equal(writes.length, 1);
  assert.equal((writes[0].row as { source: string }).source, "lichess");
});

test("forwards filters to Lichess and skips the Supabase cache", async (t) => {
  state.public = createFakeSupabase({
    tables: {
      explorer_cache: {
        maybeSingle: {
          payload: {
            source: "masters",
            fen: GIUOCO,
            white: 1,
            draws: 0,
            black: 0,
            opening: null,
            moves: [],
            games: [],
          },
          fetched_at: new Date().toISOString(),
        },
      },
    },
  });
  const service = createFakeSupabase();
  state.service = service;
  let fetched = "";
  mockFetch(t, (fetchUrl) => {
    fetched = fetchUrl;
    return jsonResponse({ white: 9, draws: 9, black: 9, moves: [], topGames: [], recentGames: [] });
  });
  const { res, body } = await get(GIUOCO, "masters", "&since=2020");
  assert.equal(res.status, 200);
  assert.match(fetched, /since=2020/);
  // Filtered lookups bypass both the Supabase read (fetch still ran despite
  // the cached row) and the write-through.
  assert.equal((body as { white: number }).white, 9);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=30, s-maxage=60");
  assert.equal(service.calls.upsert.length, 0);
});

test("returns a noticed empty response when Lichess is unreachable", async (t) => {
  state.public = createFakeSupabase();
  state.service = createFakeSupabase();
  mockFetch(t, () => jsonResponse({ error: "down" }, 500));
  const { res, body } = await get(PETROV, "lichess", "&speeds=blitz");
  assert.equal(res.status, 200);
  const payload = body as { source: string; notice?: unknown };
  assert.equal(payload.source, "lichess");
  assert.equal(typeof payload.notice, "string");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=30, s-maxage=60");
});

test("rate-limits after 60 requests from one IP", async () => {
  state.public = createFakeSupabase();
  state.service = createFakeSupabase();
  const ip = nextTestIp();
  let last = { status: 0, res: null as unknown as Response | null };
  for (let i = 0; i < 61; i += 1) {
    const { res } = await get(STARTPOS, "curated", "", ip);
    last = { status: res.status, res };
  }
  assert.equal(last.status, 429);
  assert.equal(last.res?.headers.get("Cache-Control"), null);
});

test("serves cached fallback responses with notice within fallback TTL without re-fetching upstream", async (t) => {
  state.public = createFakeSupabase();
  const service = createFakeSupabase();
  state.service = service;
  let fetchCount = 0;
  mockFetch(t, () => {
    fetchCount += 1;
    return jsonResponse({ error: "down" }, 500);
  });
  const first = await get(PETROV, "lichess");
  assert.equal(first.res.status, 200);
  const firstPayload = first.body as { source: string; notice?: unknown };
  assert.equal(firstPayload.source, "lichess");
  assert.equal(typeof firstPayload.notice, "string");
  assert.equal(fetchCount, 2);

  // Subsequent call for the same FEN within fallback TTL hits memoryCache directly
  const second = await get(PETROV, "lichess");
  assert.equal(second.res.status, 200);
  assert.deepEqual(second.body, firstPayload);
  assert.equal(fetchCount, 2);
  assert.equal(service.calls.upsert.length, 0);
});

test("backs off Lichess upstream queries when upstream has recently failed", async (t) => {
  state.public = createFakeSupabase();
  state.service = createFakeSupabase();
  let fetchCount = 0;
  mockFetch(t, () => {
    fetchCount += 1;
    return jsonResponse({ error: "down" }, 500);
  });
  // First query fails both hosts and initiates backoff
  await get(PETROV, "lichess");
  assert.equal(fetchCount, 2);

  // Second query for a different position returns fallback immediately due to backoff
  const second = await get(GIUOCO, "lichess");
  assert.equal(second.res.status, 200);
  const secondPayload = second.body as { source: string; notice?: unknown };
  assert.equal(typeof secondPayload.notice, "string");
  assert.equal(fetchCount, 2);
});

const RUY = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
const SCANDI = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
const SICILIAN = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2";
const ALEKHINE = "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2";

test("a masters failure does not block the lichess source", async (t) => {
  state.public = createFakeSupabase();
  state.service = createFakeSupabase();
  const live = {
    white: 10,
    draws: 5,
    black: 7,
    opening: null,
    moves: [],
    topGames: [],
    recentGames: [],
  };
  mockFetch(t, (fetchUrl) => {
    if (fetchUrl.includes("/masters?")) {
      return jsonResponse({ error: "down" }, 500);
    }
    return jsonResponse(live);
  });
  const masters = await get(RUY, "masters");
  assert.equal(masters.res.status, 200);
  assert.equal(typeof (masters.body as { notice?: unknown }).notice, "string");

  const lichess = await get(SCANDI, "lichess");
  assert.equal(lichess.res.status, 200);
  assert.equal((lichess.body as { white: number }).white, 10);
});

test("an oversized upstream body falls back to the book/empty payload", async (t) => {
  state.public = createFakeSupabase();
  state.service = createFakeSupabase();
  const big = `{"white":1,"draws":0,"black":0,"moves":[],"padding":"${"x".repeat(600 * 1024)}"}`;
  mockFetch(t, () => {
    return new Response(big, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const { res, body } = await get(SICILIAN, "lichess");
  assert.equal(res.status, 200);
  const payload = body as { source: string; notice?: unknown };
  assert.equal(payload.source, "lichess");
  assert.equal(typeof payload.notice, "string");
});

test("a failing cache write still returns 200 and logs once", async (t) => {
  state.public = createFakeSupabase();
  state.service = createFakeSupabase({
    tables: { explorer_cache: { writeError: { code: "UPSET_FAIL", message: "boom" } } },
  });
  mockFetch(t, () => {
    return jsonResponse({ white: 10, draws: 5, black: 7, moves: [], topGames: [], recentGames: [] });
  });
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  t.after(() => {
    console.error = originalError;
  });
  const { res, body } = await get(ALEKHINE, "lichess");
  assert.equal(res.status, 200);
  assert.equal((body as { source: string; white: number }).source, "lichess");
  assert.equal((body as { source: string; white: number }).white, 10);
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /\[explorer\] cache write failed/);
});

