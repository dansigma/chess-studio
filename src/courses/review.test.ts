import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REVIEW_LADDER_HOURS, afterFirstLearn, afterReview, studyStatus } from "./review.ts";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const plus = (hours: number) => new Date(T0.getTime() + hours * 3_600_000);

describe("review ladder", () => {
  it("has the seven steps", () => {
    assert.deepEqual([...REVIEW_LADDER_HOURS], [4, 24, 72, 168, 336, 720, 2160]);
  });

  it("first learn sets level 1 due in 4 h", () => {
    const next = afterFirstLearn({ step: 3, learned: true }, T0);
    assert.equal(next.reviewLevel, 1);
    assert.equal(next.reviewDueAt, plus(4).toISOString());
    assert.equal(next.lastReviewedAt, T0.toISOString());
  });

  it("climbs the whole ladder on correct reviews and caps at 7", () => {
    let p = afterFirstLearn({ step: 3, learned: true }, T0);
    for (let level = 2; level <= 7; level++) {
      p = afterReview(p, { correct: true }, T0);
      assert.equal(p.reviewLevel, level);
      assert.equal(p.reviewDueAt, plus(REVIEW_LADDER_HOURS[level - 1]).toISOString());
    }
    p = afterReview(p, { correct: true }, T0);
    assert.equal(p.reviewLevel, 7);
    assert.equal(p.reviewDueAt, plus(2160).toISOString());
  });

  it("a mistake drops back to level 1", () => {
    const p = afterReview({ step: 3, learned: true, reviewLevel: 5 }, { correct: false }, T0);
    assert.equal(p.reviewLevel, 1);
    assert.equal(p.reviewDueAt, plus(4).toISOString());
  });
});

describe("studyStatus", () => {
  it("is new when never completed", () => {
    assert.equal(studyStatus(undefined, T0), "new");
    assert.equal(studyStatus({ step: 2, learned: false }, T0), "new");
  });

  it("is learned before the due time and review at or after it", () => {
    const p = afterFirstLearn({ step: 3, learned: true }, T0);
    assert.equal(studyStatus(p, plus(3.99)), "learned");
    assert.equal(studyStatus(p, plus(4)), "review");
    assert.equal(studyStatus(p, plus(100)), "review");
  });

  it("treats a legacy learned line without a due date as learned", () => {
    assert.equal(studyStatus({ step: 3, learned: true }, T0), "learned");
  });
});
