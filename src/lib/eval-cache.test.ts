import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_EVAL_CACHE_ENTRIES,
  capEvalCache,
  resolveEvalDisplay,
} from "./eval-cache.ts";

function entry(depth: number, pawns = 0.5) {
  return { pawns, label: `+${pawns}`, depth };
}

test("the documented cap is 256 entries", () => {
  assert.equal(MAX_EVAL_CACHE_ENTRIES, 256);
});

test("capEvalCache keeps every entry when under the cap", () => {
  const cache = { a: entry(1), b: entry(2) };
  const capped = capEvalCache(cache, 256);
  assert.equal(Object.keys(capped).length, 2);
  assert.deepEqual(capped.a, entry(1));
  assert.deepEqual(capped.b, entry(2));
});

test("capEvalCache evicts the oldest entries beyond max and keeps the newest", () => {
  const cache: Record<string, ReturnType<typeof entry>> = {};
  for (let index = 0; index < 260; index += 1) {
    cache[`fen-${index}`] = entry(index);
  }
  const capped = capEvalCache(cache, 256);
  assert.equal(Object.keys(capped).length, 256);
  assert.equal(capped["fen-0"], undefined);
  assert.equal(capped["fen-3"], undefined);
  assert.deepEqual(capped["fen-4"], entry(4));
  assert.deepEqual(capped["fen-259"], entry(259));
});

test("capEvalCache defaults to the documented cap", () => {
  const cache: Record<string, ReturnType<typeof entry>> = {};
  for (let index = 0; index < 300; index += 1) {
    cache[`fen-${index}`] = entry(index);
  }
  const capped = capEvalCache(cache);
  assert.equal(Object.keys(capped).length, MAX_EVAL_CACHE_ENTRIES);
  assert.equal(capped["fen-0"], undefined);
  assert.deepEqual(capped["fen-299"], entry(299));
});

test("capEvalCache does not mutate its input", () => {
  const cache = { a: entry(1), b: entry(2), c: entry(3) };
  capEvalCache(cache, 2);
  assert.deepEqual(Object.keys(cache), ["a", "b", "c"]);
});

test("resolveEvalDisplay prefers the live engine value", () => {
  const display = resolveEvalDisplay(
    { pawns: 1.2, label: "+1.2", depth: 24 },
    { pawns: 0.3, label: "+0.3", depth: 18 },
    { pawns: -0.5, label: "-0.5", depth: 20 },
    0,
  );
  assert.deepEqual(display, { pawns: 1.2, label: "+1.2", depth: 24 });
});

test("resolveEvalDisplay falls back to the cached value with its own depth", () => {
  const display = resolveEvalDisplay(
    null,
    { pawns: 0.3, label: "+0.3", depth: 18 },
    { pawns: -0.5, label: "-0.5", depth: 20 },
    0,
  );
  assert.deepEqual(display, { pawns: 0.3, label: "+0.3", depth: 18 });
});

test("resolveEvalDisplay holds the last displayed value instead of zeroing", () => {
  const display = resolveEvalDisplay(null, undefined, { pawns: -0.5, label: "-0.5", depth: 20 }, 0);
  assert.deepEqual(display, { pawns: -0.5, label: "-0.5", depth: 20 });
});

test("resolveEvalDisplay falls back to zero only when nothing was ever shown", () => {
  const display = resolveEvalDisplay(null, undefined, null, 7);
  assert.deepEqual(display, { pawns: 0, label: "", depth: 7 });
});
