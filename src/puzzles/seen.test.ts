// SIG-1179: tests for the persistent seen-history helpers (pure parts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_LOCAL_SEEN_IDS, normalizeSeenIds } from "./seen.ts";

describe("normalizeSeenIds", () => {
  it("drops non-strings, blanks and duplicates, keeping first-seen order", () => {
    assert.deepEqual(normalizeSeenIds(["a", "", "b", "a", 42, null, "c"]), ["a", "b", "c"]);
  });

  it("returns empty for non-array payloads", () => {
    assert.deepEqual(normalizeSeenIds(null), []);
    assert.deepEqual(normalizeSeenIds({}), []);
    assert.deepEqual(normalizeSeenIds("a"), []);
  });

  it("caps at the max, keeping the newest ids", () => {
    const ids = Array.from({ length: MAX_LOCAL_SEEN_IDS + 50 }, (_, i) => `p${i}`);
    const normalized = normalizeSeenIds(ids);
    assert.equal(normalized.length, MAX_LOCAL_SEEN_IDS);
    assert.equal(normalized[0], "p50");
    assert.equal(normalized[normalized.length - 1], `p${MAX_LOCAL_SEEN_IDS + 49}`);
  });

  it("respects an explicit max", () => {
    assert.deepEqual(normalizeSeenIds(["a", "b", "c"], 2), ["b", "c"]);
  });
});
