import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toCatalogCourse, toCourse, toPreviewCourse } from "./catalog.ts";
import { DEFAULT_CATALOG_FIELDS, validateCatalogFields } from "./catalog-fields.ts";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "french",
  title: "French",
  summary: "",
  cover_url: null,
  video_url: null,
  theme: "openings",
  color: "black",
  outline: [],
  published_at: "2026-10-07T00:00:00.000Z",
};

describe("catalog fields mapping (SIG-1349)", () => {
  it("defaults when the columns are absent (deploy-order safe)", () => {
    const course = toCourse(base);
    assert.equal(course?.level, "beginner");
    assert.equal(course?.language, "pt-br");
    assert.equal(course?.eloMin, null);
    assert.equal(course?.eloMax, null);
    assert.equal(course?.durationMinutes, null);
  });

  it("reads valid values and fails open on unknown ones", () => {
    const ok = toCourse({ ...base, level: "advanced", language: "en", elo_min: 1200, elo_max: 1800, duration_minutes: 90 });
    assert.equal(ok?.level, "advanced");
    assert.equal(ok?.language, "en");
    assert.equal(ok?.eloMin, 1200);
    assert.equal(ok?.eloMax, 1800);
    assert.equal(ok?.durationMinutes, 90);
    const bad = toCourse({ ...base, level: "grandmaster", language: "fr", elo_min: 1200, elo_max: null, duration_minutes: 1.5 });
    assert.ok(bad, "an unknown value must not drop the course");
    assert.equal(bad.level, "beginner");
    assert.equal(bad.language, "pt-br");
    assert.equal(bad.eloMin, null);
    assert.equal(bad.eloMax, null);
    assert.equal(bad.durationMinutes, null);
  });

  it("maps the preview row and the catalog card", () => {
    const rest: Record<string, unknown> = { ...base };
    delete rest.outline;
    const preview = toPreviewCourse({ ...(rest as Omit<typeof base, "outline">), chapters: [], level: "intermediate", language: "en", elo_min: 800, elo_max: 1400, duration_minutes: 30 });
    assert.equal(preview?.level, "intermediate");
    const card = toCatalogCourse(preview!);
    assert.deepEqual(
      { level: card.level, eloMin: card.eloMin, eloMax: card.eloMax, language: card.language, durationMinutes: card.durationMinutes },
      { level: "intermediate", eloMin: 800, eloMax: 1400, language: "en", durationMinutes: 30 },
    );
  });
});

describe("validateCatalogFields (SIG-1349)", () => {
  const ok = { ...DEFAULT_CATALOG_FIELDS };
  it("accepts defaults and a full valid set", () => {
    assert.equal(validateCatalogFields(ok), null);
    assert.equal(validateCatalogFields({ level: "advanced", language: "en", eloMin: 0, eloMax: 3500, durationMinutes: 20000 }), null);
    assert.equal(validateCatalogFields({ ...ok, eloMin: 1500, eloMax: 1500 }), null);
  });
  it("rejects an unknown level or language", () => {
    assert.deepEqual(validateCatalogFields({ ...ok, level: "pro" }), { key: "course.admin.error.invalidLevel" });
    assert.deepEqual(validateCatalogFields({ ...ok, language: "fr" }), { key: "course.admin.error.invalidLanguage" });
  });
  it("requires the Elo pair together, in range and ordered", () => {
    assert.deepEqual(validateCatalogFields({ ...ok, eloMin: 1000 }), { key: "course.admin.error.eloIncomplete" });
    assert.deepEqual(validateCatalogFields({ ...ok, eloMax: 1000 }), { key: "course.admin.error.eloIncomplete" });
    assert.deepEqual(validateCatalogFields({ ...ok, eloMin: -1, eloMax: 1000 }), { key: "course.admin.error.eloOutOfRange" });
    assert.deepEqual(validateCatalogFields({ ...ok, eloMin: 1000, eloMax: 3501 }), { key: "course.admin.error.eloOutOfRange" });
    assert.deepEqual(validateCatalogFields({ ...ok, eloMin: 1000.5, eloMax: 1200 }), { key: "course.admin.error.eloOutOfRange" });
    assert.deepEqual(validateCatalogFields({ ...ok, eloMin: 1800, eloMax: 1200 }), { key: "course.admin.error.eloOrder" });
  });
  it("bounds the duration", () => {
    for (const durationMinutes of [0, -5, 20001, 2.5]) {
      assert.deepEqual(validateCatalogFields({ ...ok, durationMinutes }), { key: "course.admin.error.invalidDuration" });
    }
  });
});
