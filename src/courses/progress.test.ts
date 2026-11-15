import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeProgress } from "./progress.ts";

describe("mergeProgress", () => {
  it("keeps an only-local entry in merged and toUpload", () => {
    const { merged, toUpload } = mergeProgress({ v1: { step: 3, learned: false } }, {});
    assert.deepEqual(merged, { v1: { step: 3, learned: false } });
    assert.deepEqual(toUpload, { v1: { step: 3, learned: false } });
  });

  it("keeps an only-remote entry in merged but not in toUpload", () => {
    const { merged, toUpload } = mergeProgress({}, { v1: { step: 2, learned: true } });
    assert.deepEqual(merged, { v1: { step: 2, learned: true } });
    assert.deepEqual(toUpload, {});
  });

  it("uploads the local values when the local step is greater", () => {
    const { merged, toUpload } = mergeProgress(
      { v1: { step: 5, learned: false } },
      { v1: { step: 3, learned: false } },
    );
    assert.deepEqual(merged, { v1: { step: 5, learned: false } });
    assert.deepEqual(toUpload, { v1: { step: 5, learned: false } });
  });

  it("takes the remote step with no upload when the remote step is greater", () => {
    const { merged, toUpload } = mergeProgress(
      { v1: { step: 2, learned: false } },
      { v1: { step: 4, learned: false } },
    );
    assert.deepEqual(merged, { v1: { step: 4, learned: false } });
    assert.deepEqual(toUpload, {});
  });

  it("merges learned=true and uploads on a tie when only local learned", () => {
    const { merged, toUpload } = mergeProgress(
      { v1: { step: 3, learned: true } },
      { v1: { step: 3, learned: false } },
    );
    assert.deepEqual(merged, { v1: { step: 3, learned: true } });
    assert.deepEqual(toUpload, { v1: { step: 3, learned: true } });
  });

  it("merges learned=true with no upload on a tie when only remote learned", () => {
    const { merged, toUpload } = mergeProgress(
      { v1: { step: 3, learned: false } },
      { v1: { step: 3, learned: true } },
    );
    assert.deepEqual(merged, { v1: { step: 3, learned: true } });
    assert.deepEqual(toUpload, {});
  });
});

describe("mergeProgress review fields", () => {
  const early = {
    step: 1,
    learned: true,
    reviewLevel: 2,
    reviewDueAt: "2026-01-03T00:00:00.000Z",
    lastReviewedAt: "2026-01-02T00:00:00.000Z",
  };
  const late = {
    step: 1,
    learned: true,
    reviewLevel: 1,
    reviewDueAt: "2026-01-09T00:00:00.000Z",
    lastReviewedAt: "2026-01-08T00:00:00.000Z",
  };

  it("takes level and due date as a pair from the latest review (a later mistake wins)", () => {
    const { merged, toUpload } = mergeProgress({ v1: late }, { v1: early });
    assert.equal(merged.v1.reviewLevel, 1);
    assert.equal(merged.v1.lastReviewedAt, late.lastReviewedAt);
    assert.equal(merged.v1.reviewDueAt, late.reviewDueAt);
    assert.ok(toUpload.v1);
  });

  it("keeps the higher level and its own due date on a review-time tie", () => {
    const tied = { ...late, lastReviewedAt: early.lastReviewedAt };
    const { merged } = mergeProgress({ v1: tied }, { v1: early });
    assert.equal(merged.v1.reviewLevel, 2);
    assert.equal(merged.v1.reviewDueAt, early.reviewDueAt);
  });

  it("does not upload when remote already equals the merge", () => {
    const { toUpload } = mergeProgress({ v1: { step: 1, learned: true } }, { v1: early });
    assert.deepEqual(toUpload, {});
  });

  it("keeps a review date when the other side has none", () => {
    const { merged } = mergeProgress({ v1: { step: 1, learned: true } }, { v1: late });
    assert.equal(merged.v1.reviewDueAt, late.reviewDueAt);
  });

  it("keeps the latest updatedAt from either side", () => {
    const { merged } = mergeProgress(
      { v1: { step: 1, learned: false, updatedAt: "2026-11-02T00:00:00Z" }, v2: { step: 1, learned: false } },
      {
        v1: { step: 1, learned: false, updatedAt: "2026-11-01T00:00:00Z" },
        v2: { step: 1, learned: false, updatedAt: "2026-11-03T00:00:00Z" },
      },
    );
    assert.equal(merged.v1.updatedAt, "2026-11-02T00:00:00Z");
    assert.equal(merged.v2.updatedAt, "2026-11-03T00:00:00Z");
  });
});
