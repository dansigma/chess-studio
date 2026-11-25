// SIG-1496: the standings proxy validates the tour id, passes the Lichess body through, caches per tour
// and dedupes concurrent requests.
import test from "node:test";
import assert from "node:assert/strict";
import { jsonResponse, makeGetRequest, mockFetch } from "@/src/test-utils/route-test.ts";
import { GET, _resetLiveStandingsForTest } from "./route.ts";

const ROWS = [{ name: "Vaz, Ethan", fideId: 25940783, played: 8, score: 7.5, rank: 1 }];
const url = (tour: string) => `http://localhost/api/live/standings?tour=${tour}`;

test("rejects a missing or malformed tour id without calling Lichess", async (t) => {
  _resetLiveStandingsForTest();
  mockFetch(t, () => null);
  assert.equal((await GET(makeGetRequest("http://localhost/api/live/standings"))).status, 400);
  assert.equal((await GET(makeGetRequest(url("../../x")))).status, 400);
});

test("passes the Lichess players list through and caches it per tour", async (t) => {
  _resetLiveStandingsForTest();
  const calls: string[] = [];
  mockFetch(t, (requested, init) => {
    calls.push(requested);
    assert.equal(new Headers(init?.headers).get("Accept"), "application/json");
    assert.match(new Headers(init?.headers).get("User-Agent") ?? "", /XadrezDigital/);
    return jsonResponse(ROWS);
  });
  const first = await GET(makeGetRequest(url("wYvYFVtt")));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), ROWS);
  assert.match(first.headers.get("Cache-Control") ?? "", /max-age=60/);
  const second = await GET(makeGetRequest(url("wYvYFVtt")));
  assert.deepEqual(await second.json(), ROWS);
  assert.deepEqual(calls, ["https://lichess.org/broadcast/wYvYFVtt/players"]);
});

test("concurrent requests for one tour share a single upstream call", async (t) => {
  _resetLiveStandingsForTest();
  let calls = 0;
  mockFetch(t, async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return jsonResponse(ROWS);
  });
  const responses = await Promise.all([GET(makeGetRequest(url("zVXx5cjN"))), GET(makeGetRequest(url("zVXx5cjN")))]);
  assert.deepEqual(responses.map((r) => r.status), [200, 200]);
  assert.equal(calls, 1);
});

test("maps upstream failures: 404 stays 404, other errors and non-array bodies are 502", async (t) => {
  _resetLiveStandingsForTest();
  const bodies: Record<string, Response> = {
    aaaaaaaa: new Response("not found", { status: 404 }),
    bbbbbbbb: new Response("boom", { status: 500 }),
    cccccccc: jsonResponse({ not: "a list" }),
  };
  mockFetch(t, (requested) => bodies[requested.split("/")[4] ?? ""] ?? null);
  assert.equal((await GET(makeGetRequest(url("aaaaaaaa")))).status, 404);
  assert.equal((await GET(makeGetRequest(url("bbbbbbbb")))).status, 502);
  assert.equal((await GET(makeGetRequest(url("cccccccc")))).status, 502);
});
