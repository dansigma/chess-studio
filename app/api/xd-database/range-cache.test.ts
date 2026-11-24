import assert from "node:assert/strict";
import { test } from "node:test";

import { cacheXdRanges } from "./range-cache.ts";
import { runWithExecutionContext } from "vinext/shims/request-context";
import { newTiming, withTiming } from "./timing.ts";

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
    // Data files cache ranges; players.bin is cached too. Whole-file reads of .bin files bypass the cache.
    await source("players.bin", { start: 0, end: 4 });
    await source("players.bin", { start: 0, end: 4 });
    await source("player-games.bin", { start: 0, end: 4 });
    await source("position-games.bin", { start: 0, end: 4 });
    assert.equal(reads, 6);
    await source("tree.bin");
    await source("tree.bin");
    assert.equal(reads, 8);
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

test("index files are cached whole for a second reader", async () => {
  installCache(new Map());
  try {
    let reads = 0;
    const read = async () => { reads++; return new Uint8Array(5).fill(1); };
    for (const file of ["tree.idx", "games.idx", "players.idx"] as const) {
      await cacheXdRanges("https://example.test", read)(file);
    }
    assert.equal(reads, 3);
    const timing = newTiming();
    await withTiming(timing, async () => {
      for (const file of ["tree.idx", "games.idx", "players.idx"] as const) {
        assert.equal((await cacheXdRanges("https://example.test", read)(file)).byteLength, 5);
      }
    });
    assert.equal(reads, 3);
    assert.deepEqual([timing.cacheHits, timing.cacheMisses], [3, 0]);
  } finally {
    Reflect.deleteProperty(globalThis, "caches");
  }
});

test("a failing cache write does not fail the read", async () => {
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { default: { match: async () => undefined, put: async () => { throw new Error("quota"); } } },
  });
  try {
    const source = cacheXdRanges("https://example.test", async () => new Uint8Array(2));
    assert.equal((await source("tree.bin", { start: 0, end: 2 })).byteLength, 2);
  } finally {
    Reflect.deleteProperty(globalThis, "caches");
  }
});

test("cache writes go to waitUntil when the request has an execution context", async () => {
  installCache(new Map());
  try {
    const pending: Promise<unknown>[] = [];
    const source = cacheXdRanges("https://example.test", async () => new Uint8Array(2));
    await runWithExecutionContext({ waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } } as never, async () => {
      await source("tree.bin", { start: 0, end: 2 });
    });
    assert.equal(pending.length, 1);
    await Promise.all(pending);
  } finally {
    Reflect.deleteProperty(globalThis, "caches");
  }
});
