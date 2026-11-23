import assert from "node:assert/strict";
import { test } from "node:test";

import { cacheXdRanges } from "./range-cache.ts";

function installCache(store: Map<string, Response>, failMatch = false) {
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { default: {
      match: async (key: string) => {
        if (failMatch) throw new Error("cache down");
        return store.get(key)?.clone();
      },
      put: async (key: string, response: Response) => { store.set(key, response); },
    } },
  });
}

test("a repeated range read is served from the edge cache, not the source", async () => {
  const store = new Map<string, Response>();
  installCache(store);
  try {
    let reads = 0;
    const source = cacheXdRanges("https://example.test", async (_file, range) => {
      reads++;
      return new Uint8Array(range ? range.end - range.start : 4).fill(7);
    });
    assert.equal((await source("tree.bin", { start: 0, end: 4 })).byteLength, 4);
    assert.deepEqual([...await source("tree.bin", { start: 0, end: 4 })], [7, 7, 7, 7]);
    assert.equal(reads, 1);
    await source("tree.bin", { start: 4, end: 8 });
    await source("games.bin", { start: 0, end: 4 });
    assert.equal(reads, 3);
    // Other files and whole-file reads bypass the cache.
    await source("players.bin" as "tree.bin", { start: 0, end: 4 });
    await source("tree.bin");
    await source("tree.bin");
    assert.equal(reads, 6);
  } finally {
    Reflect.deleteProperty(globalThis, "caches");
  }
});

test("a failing cache falls back to the source", async () => {
  installCache(new Map(), true);
  try {
    const source = cacheXdRanges("https://example.test", async () => new Uint8Array(2));
    assert.equal((await source("games.bin", { start: 0, end: 2 })).byteLength, 2);
  } finally {
    Reflect.deleteProperty(globalThis, "caches");
  }
});
