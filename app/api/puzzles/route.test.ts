// Tests for the puzzles API route: single-item lookup, query validation,
// pagination/envelope/sample behavior, and rate limiting
// (see `.artifacts/plans/issue-932.md` Phase 3).
import test from "node:test";
import assert from "node:assert/strict";
import { makeGetRequest, nextTestIp } from "@/src/test-utils/route-test.ts";

const { GET } = await import("./route.ts");

const BASE = "http://app.test/api/puzzles";

async function get(query: string, ip = nextTestIp()) {
  const res = await GET(makeGetRequest(`${BASE}${query}`, ip));
  const body = (await res.json()) as unknown;
  return { res, body };
}

test("single id lookup returns the puzzle with cache headers", async () => {
  const { res, body } = await get("?id=queen-corridor");
  assert.equal(res.status, 200);
  assert.equal((body as { id: string }).id, "queen-corridor");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600, stale-while-revalidate=86400");
});

test("unknown id returns 404", async () => {
  const { res, body } = await get("?id=no-such-puzzle-xyz");
  assert.equal(res.status, 404);
  assert.deepEqual(body, { error: "Puzzle not found" });
});

test("malformed id returns 400", async () => {
  const { res, body } = await get("?id=bad!!id");
  assert.equal(res.status, 400);
  assert.deepEqual(body, { error: "id is required" });
});

test("invalid theme returns 400", async () => {
  const { res } = await get("?theme=not-a-theme");
  assert.equal(res.status, 400);
});

test("negative minRating returns 400", async () => {
  const { res } = await get("?minRating=-5");
  assert.equal(res.status, 400);
});

test("minRating above maxRating returns 400", async () => {
  const { res } = await get("?minRating=2000&maxRating=1000");
  assert.equal(res.status, 400);
});

test("out-of-range limit returns 400", async () => {
  const { res } = await get("?limit=1001");
  assert.equal(res.status, 400);
});

test("non-integer seed returns 400", async () => {
  const { res } = await get("?seed=abc");
  assert.equal(res.status, 400);
});

test("default list returns an array with X-Total-Count", async () => {
  const { res, body } = await get("?limit=2");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 2);
  const total = Number(res.headers.get("X-Total-Count"));
  assert.ok(total >= 2);
});

test("envelope wraps items with the total", async () => {
  const { res, body } = await get("?limit=2&envelope=true");
  assert.equal(res.status, 200);
  const envelope = body as { items: unknown[]; total: number };
  assert.equal(envelope.items.length, 2);
  assert.equal(envelope.total, Number(res.headers.get("X-Total-Count")));
});

test("unseeded sample disables caching", async () => {
  const { res } = await get("?sample=1&limit=1");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("seeded sample is deterministic", async () => {
  const first = await get("?sample=1&seed=42&limit=3");
  const second = await get("?sample=1&seed=42&limit=3");
  assert.deepEqual(second.body, first.body);
});

test("rate-limits after 60 requests from one IP", async () => {
  const ip = nextTestIp();
  let last = { status: 0 };
  for (let i = 0; i < 61; i += 1) {
    const { res } = await get("?id=no-such-puzzle-xyz", ip);
    last = { status: res.status };
  }
  assert.equal(last.status, 429);
});
