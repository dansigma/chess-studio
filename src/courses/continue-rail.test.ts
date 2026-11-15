import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { continueRail } from "./continue-rail.ts";
import type { CatalogCourse, VariationProgress } from "./types.ts";

const NOW = new Date("2026-11-15T12:00:00Z");

function course(id: string, ids: string[]): CatalogCourse {
  return {
    id,
    slug: id,
    title: id.toUpperCase(),
    summary: "",
    theme: "openings",
    color: "white",
    accessTier: "free",
    priceCents: null,
    level: "beginner",
    eloMin: null,
    eloMax: null,
    language: "pt-br",
    durationMinutes: null,
    chapterCount: 1,
    moveCount: ids.length,
    variationIds: ids,
    variationTitles: Object.fromEntries(ids.map((v) => [v, `Line ${v}`])),
  };
}

const started = (updatedAt?: string): VariationProgress => ({ step: 2, learned: false, updatedAt });

describe("continueRail", () => {
  it("is empty without progress, and ignores step 0", () => {
    const courses = [course("a", ["a1"])];
    assert.deepEqual(continueRail(courses, {}, NOW), []);
    assert.deepEqual(continueRail(courses, { a1: { step: 0, learned: false } }, NOW), []);
  });

  it("sorts by the latest update among a course's lines, undated last", () => {
    const courses = [course("a", ["a1"]), course("b", ["b1", "b2"]), course("c", ["c1"]), course("d", ["d1"])];
    const rail = continueRail(
      courses,
      {
        a1: started("2026-11-01T00:00:00Z"),
        b1: started("2026-10-01T00:00:00Z"),
        b2: started("2026-11-10T00:00:00Z"),
        c1: started(),
        d1: started(),
      },
      NOW,
    );
    assert.deepEqual(rail.map((item) => item.course.id), ["b", "a", "c", "d"]);
    assert.equal(rail[0].lastStudiedAt, "2026-11-10T00:00:00Z");
    assert.equal(rail[2].lastStudiedAt, null);
  });

  it("caps at four items", () => {
    const courses = ["a", "b", "c", "d", "e"].map((id) => course(id, [`${id}1`]));
    const progress = Object.fromEntries(courses.map((c) => [c.variationIds[0], started("2026-11-01T00:00:00Z")]));
    assert.equal(continueRail(courses, progress, NOW).length, 4);
  });

  it("gives next line, title, percent and due count", () => {
    const courses = [course("a", ["a1", "a2", "a3"])];
    const [item] = continueRail(
      courses,
      {
        a1: { step: 4, learned: true, reviewLevel: 1, reviewDueAt: "2026-11-15T08:00:00Z", updatedAt: "2026-11-14T00:00:00Z" },
        a2: { step: 4, learned: true, reviewLevel: 1, reviewDueAt: "2026-11-16T08:00:00Z" },
      },
      NOW,
    );
    assert.equal(item.nextLineId, "a3");
    assert.equal(item.nextLineTitle, "Line a3");
    assert.equal(item.percent, 67);
    assert.equal(item.dueCount, 1);
  });

  it("has no next line when every line is learned", () => {
    const [item] = continueRail([course("a", ["a1"])], { a1: { step: 4, learned: true } }, NOW);
    assert.equal(item.nextLineId, null);
    assert.equal(item.nextLineTitle, null);
    assert.equal(item.percent, 100);
  });
});
