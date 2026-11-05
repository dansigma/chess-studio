import assert from "node:assert/strict";
import test from "node:test";
import { STANDARD_START_FEN, fetchOpeningBook } from "./book-client.ts";

const originalFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(handler: (init: RequestInit) => Response | Promise<Response>) {
  const calls: RequestInit[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    return handler(init);
  }) as typeof fetch;
  return calls;
}

test("one POST per review with the moves", async () => {
  const calls = stubFetch(() => Response.json({ available: true, plies: 3, partial: false, counts: [] }));
  const result = await fetchOpeningBook(STANDARD_START_FEN, ["e2e4", "e7e5", "g1f3", "b8c6"]);
  assert.deepEqual(result, { plies: 3 });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(String(calls[0].body)), { moves: ["e2e4", "e7e5", "g1f3", "b8c6"] });
});

test("a non-standard start makes no request and has no book", async () => {
  const calls = stubFetch(() => Response.json({}));
  assert.deepEqual(await fetchOpeningBook("8/8/8/8/8/8/8/K6k w - - 0 1", ["a1a2"]), { plies: 0 });
  assert.deepEqual(await fetchOpeningBook(STANDARD_START_FEN, []), { plies: 0 });
  assert.equal(calls.length, 0);
});

test("failures (http error, unavailable, network error) all mean null", async () => {
  stubFetch(() => new Response("x", { status: 429 }));
  assert.equal(await fetchOpeningBook(STANDARD_START_FEN, ["e2e4"]), null);
  stubFetch(() => Response.json({ available: false, plies: 0 }));
  assert.equal(await fetchOpeningBook(STANDARD_START_FEN, ["e2e4"]), null);
  stubFetch(() => {
    throw new Error("offline");
  });
  assert.equal(await fetchOpeningBook(STANDARD_START_FEN, ["e2e4"]), null);
});

test("only the leading valid moves are sent and the answer is clamped to them", async () => {
  const calls = stubFetch(() => Response.json({ available: true, plies: 99 }));
  const result = await fetchOpeningBook(STANDARD_START_FEN, ["e2e4", "e7e5", "0000", "g1f3"]);
  assert.deepEqual(JSON.parse(String(calls[0].body)), { moves: ["e2e4", "e7e5"] });
  assert.deepEqual(result, { plies: 2 });
});

test("a caller abort resolves null", async () => {
  const controller = new AbortController();
  stubFetch((init) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
  const pending = fetchOpeningBook(STANDARD_START_FEN, ["e2e4"], controller.signal);
  controller.abort();
  assert.equal(await pending, null);
});
