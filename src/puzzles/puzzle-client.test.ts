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

test("loadPuzzleById falls back to the starter catalog when the network fails", async () => {
  const starter = getFallbackCatalog()[0]!;
  globalThis.fetch = (async () => {
    throw new Error("offline");
  }) as typeof fetch;

  const loaded = await loadPuzzleById(starter.id);
  assert.equal(loaded?.id, starter.id);
  assert.equal(await loadPuzzleById("missing-offline-id"), null);
});

test("loadPuzzleById falls back cleanly when the API returns a malformed payload", async () => {
  const starter = getFallbackCatalog()[1]!;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ id: starter.id }), { status: 200 })) as typeof fetch;

  const loaded = await loadPuzzleById(starter.id);
  assert.equal(loaded?.id, starter.id);
});
