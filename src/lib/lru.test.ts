import assert from "node:assert/strict";
import test from "node:test";
import { createLruCache } from "./lru.ts";

test("evicts the oldest entry when over capacity", () => {
  const cache = createLruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
});

test("get refreshes recency so the touched entry survives eviction", () => {
  const cache = createLruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
});

test("size reports the entry count", () => {
  const cache = createLruCache<string, number>(3);
  assert.equal(cache.size(), 0);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.size(), 2);
  cache.set("c", 3);
  cache.set("d", 4);
  assert.equal(cache.size(), 3);
});

test("updating an existing key keeps size and refreshes recency", () => {
  const cache = createLruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 10);
  assert.equal(cache.size(), 2);
  assert.equal(cache.get("a"), 10);
  cache.set("c", 3);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 10);
  assert.equal(cache.get("c"), 3);
});
