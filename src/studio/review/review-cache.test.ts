import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_ENGINE_ID,
  REVIEW_SCHEMA_VERSION,
  reviewFingerprintInput,
  clearReviewCache,
  getCachedReview,
  persistentReviewKey,
  reviewCacheKey,
  setCachedReview,
} from "./review-cache";

const rows = [] as Parameters<typeof setCachedReview>[1];

test("the key depends on the line and preset, not on any engine setting", () => {
  const base = reviewCacheKey(["a", "b"], ["e2e4"], "standard");
  assert.equal(base, reviewCacheKey(["a", "b"], ["e2e4"], "standard"));
  assert.notEqual(base, reviewCacheKey(["a", "c"], ["e2e4"], "standard"));
  assert.notEqual(base, reviewCacheKey(["a", "b"], ["d2d4"], "standard"));
  assert.notEqual(base, reviewCacheKey(["a", "b"], ["e2e4"], "deep"));
});

test("the key is versioned", () => {
  assert.ok(reviewCacheKey(["a", "b"], ["e2e4"], "standard").startsWith(`v${REVIEW_SCHEMA_VERSION}:`));
});

test("persistent keys are stable, versioned and vary with input", async () => {
  const base = await persistentReviewKey(["a", "b"], ["e2e4"], "standard");
  assert.ok(base.startsWith(`v${REVIEW_SCHEMA_VERSION}:`));
  assert.equal(base, await persistentReviewKey(["a", "b"], ["e2e4"], "standard"));
  assert.notEqual(base, await persistentReviewKey(["a", "c"], ["e2e4"], "standard"));
  assert.notEqual(base, await persistentReviewKey(["a", "b"], ["d2d4"], "standard"));
  assert.notEqual(base, await persistentReviewKey(["a", "b"], ["e2e4"], "deep"));
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

test("SIG-1223: lite-era keys are kept and full-build keys can no longer match", () => {
  // Fingerprints used to start with the Settings engine build. Lite reviews keep
  // theirs (still valid); full-build ones ("standard:...") are unreachable.
  assert.equal(REVIEW_ENGINE_ID, "lite");
  const fingerprint = reviewFingerprintInput(["a", "b"], ["e2e4"], "standard");
  assert.ok(fingerprint.startsWith("lite:standard:"));
  assert.ok(!fingerprint.startsWith("standard:"));
});
