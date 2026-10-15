// Tests for the masters-pgn API route: id validation, embedded book hits,
// Lichess upstream fallback, and rate limiting
// (see `.artifacts/plans/issue-932.md` Phase 3).
import test from "node:test";
import assert from "node:assert/strict";
import {
  jsonResponse,
  makeGetRequest,
  mockFetch,
  nextTestIp,
} from "@/src/test-utils/route-test.ts";

const { GET } = await import("./route.ts");

const BASE = "http://app.test/api/masters-pgn";

test("missing id returns 400", async () => {
  const res = await GET(makeGetRequest(BASE));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "id is required" });
});

test("malformed id returns 400", async () => {
  const res = await GET(makeGetRequest(`${BASE}?id=bad!!id`));
  assert.equal(res.status, 400);
});

test("embedded book hit returns PGN as text without fetching upstream", async (t) => {
  mockFetch(t, () => {
    throw new Error("book hit must not fetch upstream");
  });
  const res = await GET(makeGetRequest(`${BASE}?id=book-opera`));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/plain; charset=utf-8");
  const pgn = await res.text();
  assert.ok(pgn.includes("Paris Opera"));
});

test("unknown id falls back to the Lichess upstream", async (t) => {
  mockFetch(t, (url) =>
    url.includes("explorer.lichess.ovh") ? new Response('[White "Upstream"]\n\n1. e4 *') : null,
  );
  const res = await GET(makeGetRequest(`${BASE}?id=abcdefgh`));
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes("Upstream"));
});

test("upstream misses on both hosts return 404", async (t) => {
  mockFetch(t, (url) =>
    url.includes("lichess") ? jsonResponse({ error: "nope" }, 404) : null,
  );
  const res = await GET(makeGetRequest(`${BASE}?id=abcdefgh`));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Game not found" });
});

test("upstream payload exceeding cap returns 502", async (t) => {
  mockFetch(t, (url) =>
    url.includes("explorer.lichess.ovh")
      ? new Response("x".repeat(1024 * 1024 + 10))
      : null,
  );
  const res = await GET(makeGetRequest(`${BASE}?id=abcdefgh`));
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: "Upstream response too large" });
});

test("rate-limits after 30 requests from one IP", async () => {
  const ip = nextTestIp();
  let last = 0;
  for (let i = 0; i < 31; i += 1) {
    const res = await GET(makeGetRequest(`${BASE}?id=book-opera`, ip));
    // Drain the body so streaming responses do not leak resources.
    await res.text();
    last = res.status;
  }
  assert.equal(last, 429);
});
