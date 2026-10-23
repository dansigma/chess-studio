import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { jsonResponse, mockFetch } from "@/src/test-utils/route-test.ts";
import {
  _resetExplorerUpstreamForTest,
  EXPLORER_UPSTREAM_MAX_BYTES,
  fetchExplorerUpstream,
} from "./explorer-upstream.ts";

const FEN_A = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FEN_B = "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

const LIVE = {
  white: 10,
  draws: 5,
  black: 7,
  opening: { eco: "C50", name: "Italian Game" },
  moves: [{ san: "Nf3", uci: "g1f3", white: 4, draws: 2, black: 1, averageRating: 2400 }],
  topGames: [],
  recentGames: [],
};

beforeEach(() => {
  _resetExplorerUpstreamForTest();
});

test("a masters failure leaves the lichess source callable", async (t) => {
  const fetched: string[] = [];
  mockFetch(t, (fetchUrl) => {
    fetched.push(fetchUrl);
    if (fetchUrl.includes("/masters?")) {
      return jsonResponse({ error: "down" }, 500);
    }
    return jsonResponse(LIVE);
  });
  const masters = await fetchExplorerUpstream("masters", FEN_A, "");
  assert.equal(masters, null);
  const lichess = await fetchExplorerUpstream("lichess", FEN_B, "");
  assert.ok(lichess);
  assert.equal(lichess.source, "lichess");
  assert.equal(lichess.white, 10);
  assert.ok(fetched.some((fetchUrl) => fetchUrl.includes("/lichess?")));
});

test("a lichess failure leaves the masters source callable", async (t) => {
  const fetched: string[] = [];
  mockFetch(t, (fetchUrl) => {
    fetched.push(fetchUrl);
    if (fetchUrl.includes("/lichess?")) {
      return jsonResponse({ error: "down" }, 500);
    }
    return jsonResponse(LIVE);
  });
  const lichess = await fetchExplorerUpstream("lichess", FEN_A, "");
  assert.equal(lichess, null);
  const masters = await fetchExplorerUpstream("masters", FEN_B, "");
  assert.ok(masters);
  assert.equal(masters.source, "masters");
  assert.equal(masters.white, 10);
  assert.ok(fetched.some((fetchUrl) => fetchUrl.includes("/masters?")));
});

test("an oversized upstream body is treated as a failure and backs off that source", async (t) => {
  const big = `{"white":1,"draws":0,"black":0,"moves":[],"padding":"${"x".repeat(600 * 1024)}"}`;
  assert.ok(big.length > EXPLORER_UPSTREAM_MAX_BYTES);
  let fetchCount = 0;
  mockFetch(t, () => {
    fetchCount += 1;
    return new Response(big, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const first = await fetchExplorerUpstream("lichess", FEN_A, "");
  assert.equal(first, null);
  assert.equal(fetchCount, 2);
  const second = await fetchExplorerUpstream("lichess", FEN_B, "");
  assert.equal(second, null);
  assert.equal(fetchCount, 2);
});
