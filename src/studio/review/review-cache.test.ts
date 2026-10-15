import assert from "node:assert/strict";
import test from "node:test";
import { clearReviewCache, getCachedReview, reviewCacheKey, setCachedReview } from "./review-cache.ts";

const rows = [] as Parameters<typeof setCachedReview>[1];

test("the key depends on the line, preset and engine build", () => {
  const base = reviewCacheKey(["a", "b"], ["e2e4"], "standard", "lite");
  assert.equal(base, reviewCacheKey(["a", "b"], ["e2e4"], "standard", "lite"));
  assert.notEqual(base, reviewCacheKey(["a", "c"], ["e2e4"], "standard", "lite"));
  assert.notEqual(base, reviewCacheKey(["a", "b"], ["d2d4"], "standard", "lite"));
  assert.notEqual(base, reviewCacheKey(["a", "b"], ["e2e4"], "deep", "lite"));
  assert.notEqual(base, reviewCacheKey(["a", "b"], ["e2e4"], "standard", "standard"));
});

test("stored reviews come back until evicted, oldest first", () => {
  clearReviewCache();
  for (let index = 0; index < 13; index += 1) {
    setCachedReview(`k${index}`, rows);
  }
  assert.equal(getCachedReview("k0"), null);
  assert.equal(getCachedReview("k12"), rows);
});

test("reading refreshes recency", () => {
  clearReviewCache();
  for (let index = 0; index < 12; index += 1) {
    setCachedReview(`k${index}`, rows);
  }
  getCachedReview("k0");
  setCachedReview("new", rows);
  assert.equal(getCachedReview("k0"), rows);
  assert.equal(getCachedReview("k1"), null);
});
