import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getFallbackCatalog, loadPuzzleById } from "./puzzle-client.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("loadPuzzleById returns null for empty id without fetching", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("should not fetch");
  }) as typeof fetch;
  assert.equal(await loadPuzzleById(""), null);
  assert.equal(called, false);
});

test("loadPuzzleById fetches /api/puzzles?id=... and returns the compiled puzzle", async () => {
  const sample = getFallbackCatalog()[0]!;
  let requestedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ ...sample, id: "abc12" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const loaded = await loadPuzzleById("abc12");
  assert.equal(requestedUrl, "/api/puzzles?id=abc12");
  assert.equal(loaded?.id, "abc12");
  assert.deepEqual(loaded?.sans, sample.sans);
});

test("loadPuzzleById returns null on 404 for unknown puzzle", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Puzzle not found" }), { status: 404 })) as typeof fetch;

  assert.equal(await loadPuzzleById("no-such-puzzle"), null);
});

test("loadPuzzleById falls back to the starter catalog on network failure and rethrows for non-starter ids", async () => {
  const starter = getFallbackCatalog()[0]!;
  globalThis.fetch = (async () => {
    throw new Error("offline");
  }) as typeof fetch;

  const loaded = await loadPuzzleById(starter.id);
  assert.equal(loaded?.id, starter.id);
  await assert.rejects(() => loadPuzzleById("missing-offline-id"), /offline/);
});

test("loadPuzzleById rethrows on 429/5xx and malformed payloads for non-starter ids", async () => {
  const starter = getFallbackCatalog()[1]!;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ id: starter.id }), { status: 200 })) as typeof fetch;

  const loaded = await loadPuzzleById(starter.id);
  assert.equal(loaded?.id, starter.id);
  await assert.rejects(() => loadPuzzleById("00sHx"), /puzzles API shape/);

  globalThis.fetch = (async () => new Response("rate limited", { status: 429 })) as typeof fetch;
  await assert.rejects(() => loadPuzzleById("00sHx"), /puzzles API 429/);

  globalThis.fetch = (async () => new Response("server error", { status: 503 })) as typeof fetch;
  await assert.rejects(() => loadPuzzleById("00sHx"), /puzzles API 503/);
});

test("loadPuzzleById aborts and rejects on timeout", async () => {
  let aborted = false;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError"));
      });
    })) as typeof fetch;

  await assert.rejects(() => loadPuzzleById("00sHx", { timeoutMs: 15 }), /timeout/);
  assert.equal(aborted, true);
});

test("loadPuzzleById respects caller AbortSignal even for starter ids", async () => {
  const starter = getFallbackCatalog()[0]!;
  const controller = new AbortController();
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    })) as typeof fetch;

  const pending = loadPuzzleById(starter.id, { signal: controller.signal, timeoutMs: 5_000 });
  controller.abort();
  await assert.rejects(() => pending, /Abort/);
});
