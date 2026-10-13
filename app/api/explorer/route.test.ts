// Tests for the explorer API route: validation, curated book, Supabase cache,
// live Lichess fallback, filter forwarding, offline notice, and rate limiting
// (see `.artifacts/plans/issue-932.md` Phase 3).
import test from "node:test";
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

const { GET } = await import("./route.ts");

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
  const badSource = await get(STARTPOS, "chesscom");
  assert.equal(badSource.res.status, 400);
  assert.deepEqual(badSource.body, { error: "fen and source=masters|lichess|curated are required" });
});

test("rejects an invalid fen", async () => {
  const { res, body } = await get("not-a-fen", "lichess");
  assert.equal(res.status, 400);
  assert.deepEqual(body, { error: "fen is not a valid position" });
});

test("serves curated positions from the embedded book", async () => {
  const { res, body } = await get(STARTPOS, "curated");
  assert.equal(res.status, 200);
  const payload = body as { source: string; fen: string; moves: unknown[] };
  assert.equal(payload.source, "curated");
  assert.equal(payload.fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
  assert.ok(payload.moves.length > 0);
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
  state.server = createFakeSupabase({
    tables: { explorer_cache: { maybeSingle: { payload: cached, fetched_at: new Date().toISOString() } } },
  });
  state.service = createFakeSupabase();
  mockFetch(t, () => {
    assert.fail("cache hit must not fetch upstream");
  });
  const { res, body } = await get(FRENCH, "masters");
  assert.equal(res.status, 200);
  assert.deepEqual(body, cached);
});

test("falls back to live Lichess on a cache miss and writes the cache through", async (t) => {
  state.server = createFakeSupabase();
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
  const writes = service.calls.upsert.filter((call) => call.table === "explorer_cache");
  assert.equal(writes.length, 1);
  assert.equal((writes[0].row as { source: string }).source, "lichess");
});

test("forwards filters to Lichess and skips the Supabase cache", async (t) => {
  state.server = createFakeSupabase({
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
  assert.equal(service.calls.upsert.length, 0);
});

test("returns a noticed empty response when Lichess is unreachable", async (t) => {
  state.server = createFakeSupabase();
  state.service = createFakeSupabase();
  mockFetch(t, () => jsonResponse({ error: "down" }, 500));
  const { res, body } = await get(PETROV, "lichess", "&speeds=blitz");
  assert.equal(res.status, 200);
  const payload = body as { source: string; notice?: unknown };
  assert.equal(payload.source, "lichess");
  assert.equal(typeof payload.notice, "string");
});

test("rate-limits after 60 requests from one IP", async () => {
  state.server = createFakeSupabase();
  state.service = createFakeSupabase();
  const ip = nextTestIp();
  let last = { status: 0 };
  for (let i = 0; i < 61; i += 1) {
    const { res } = await get(STARTPOS, "curated", "", ip);
    last = { status: res.status };
  }
  assert.equal(last.status, 429);
});
