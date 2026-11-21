import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { gzipSync } from "node:zlib";
import { encodeCountsBook } from "@/src/chess/opening-book-counts-format";
import { encodeMove } from "@/src/chess/opening-book-format";

const manifest: { file: string; countsFile?: string } = { file: "opening-book-v1.bin.gz" };
mock.module("@/src/chess/opening-book-manifest", { namedExports: { OPENING_BOOK_MANIFEST: manifest } });
const { loadCountsBook } = await import("./opening-book-counts.ts");

test("returns null without fetching when the manifest omits countsFile", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch");
  assert.equal(await loadCountsBook(), null);
  assert.equal(fetch.mock.callCount(), 0);
});

test("shares downloads, retries after the failure window, and supports immediate retry", async (t) => {
  manifest.countsFile = "opening-book-counts-v1.bin.gz";
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const bytes = encodeCountsBook([{ key: 0n, move: encodeMove("e2e4"), count: 40, total: 100 }], { maxPly: 40 });
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(Uint8Array.from(gzipSync(bytes))));
  fetch.mock.mockImplementationOnce(async () => new Response(null, { status: 503 }));

  assert.equal(await loadCountsBook(), null);
  assert.equal(await loadCountsBook(), null);
  assert.equal(fetch.mock.callCount(), 1);

  now += 5 * 60_000;
  fetch.mock.mockImplementationOnce(async () => new Response(null, { status: 503 }));
  assert.equal(await loadCountsBook(), null);
  assert.equal(await loadCountsBook(), null);
  assert.equal(fetch.mock.callCount(), 2);

  const [first, second] = await Promise.all([loadCountsBook({ retry: true }), loadCountsBook()]);
  assert.equal(first, second);
  assert.deepEqual(first?.positionFor(0n), { total: 100, moves: [{ uci: "e2e4", games: 40 }] });
  assert.equal(await loadCountsBook(), first);
  assert.equal(fetch.mock.callCount(), 3);
  assert.equal(fetch.mock.calls[2].arguments[0], "/book/opening-book-counts-v1.bin.gz");
});
