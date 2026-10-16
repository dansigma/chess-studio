import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_SCHEMA_VERSION,
  clearReviewCache,
  getCachedReview,
  persistentReviewKey,
  reviewCacheKey,
  setCachedReview,
} from "./review-cache";

const rows = [] as Parameters<typeof setCachedReview>[1];

test("the key depends on the line, preset and engine build", () => {
  const base = reviewCacheKey(["a", "b"], ["e2e4"], "standard", "lite");
  assert.equal(base, reviewCacheKey(["a", "b"], ["e2e4"], "standard", "lite"));
  assert.notEqual(base, reviewCacheKey(["a", "c"], ["e2e4"], "standard", "lite"));
  assert.notEqual(base, reviewCacheKey(["a", "b"], ["d2d4"], "standard", "lite"));
  assert.notEqual(base, reviewCacheKey(["a", "b"], ["e2e4"], "deep", "lite"));
  assert.notEqual(base, reviewCacheKey(["a", "b"], ["e2e4"], "standard", "standard"));
});

test("the key is versioned", () => {
  assert.ok(reviewCacheKey(["a", "b"], ["e2e4"], "standard", "lite").startsWith(`v${REVIEW_SCHEMA_VERSION}:`));
});

test("persistent keys are stable, versioned and vary with input", async () => {
  const base = await persistentReviewKey(["a", "b"], ["e2e4"], "standard", "lite");
  assert.ok(base.startsWith(`v${REVIEW_SCHEMA_VERSION}:`));
  assert.equal(base, await persistentReviewKey(["a", "b"], ["e2e4"], "standard", "lite"));
  assert.notEqual(base, await persistentReviewKey(["a", "c"], ["e2e4"], "standard", "lite"));
  assert.notEqual(base, await persistentReviewKey(["a", "b"], ["d2d4"], "standard", "lite"));
  assert.notEqual(base, await persistentReviewKey(["a", "b"], ["e2e4"], "deep", "lite"));
  assert.notEqual(base, await persistentReviewKey(["a", "b"], ["e2e4"], "standard", "standard"));
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
