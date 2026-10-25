import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogCoursePercent, toCatalogCourse } from "./catalog.ts";
import type { Course } from "./types.ts";

function course(): Course {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "caro-kann",
    title: "The Caro-Kann Defense",
    summary: "<p>Solid.</p>",
    coverUrl: "https://example.com/cover.jpg",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    theme: "openings",
    color: "black",
    status: "published",
    accessTier: "free",
    priceCents: null,
    chapters: [
      {
        id: "advance",
        title: "Advance",
        variations: [
          { id: "line-a", title: "A", pgn: "1. e4 c6" },
          { id: "line-b", title: "B", pgn: "1. e4 c6 2. d4 d5" },
        ],
      },
      { id: "empty", title: "Empty", variations: [] },
      {
        id: "classical",
        title: "Classical",
        variations: [{ id: "line-c", title: "C", pgn: "1. e4 c6 2. d4 dxe4" }],
      },
    ],
  };
}

describe("catalog card DTO", () => {
  it("maps a course to a chapters-free card with server-computed counts", () => {
    const card = toCatalogCourse(course());
    assert.equal(card.id, "11111111-1111-4111-8111-111111111111");
    assert.equal(card.slug, "caro-kann");
    assert.equal(card.title, "The Caro-Kann Defense");
    assert.equal(card.theme, "openings");
    assert.equal(card.color, "black");
    assert.ok(!("chapters" in card), "the chapters payload stays on the server");
    assert.equal(card.chapterCount, 2);
    assert.equal(card.moveCount, 3);
    assert.deepEqual(card.variationIds, ["line-a", "line-b", "line-c"]);
  });

  it("maps an empty course to zero counts", () => {
    const card = toCatalogCourse({ ...course(), chapters: [] });
    assert.equal(card.chapterCount, 0);
    assert.equal(card.moveCount, 0);
    assert.deepEqual(card.variationIds, []);
  });

  it("computes progress from variation ids without chapters", () => {
    const card = toCatalogCourse(course());
    assert.equal(catalogCoursePercent(card, {}), 0);
    assert.equal(
      catalogCoursePercent(card, {
        "line-a": { step: 8, learned: true },
        "line-b": { step: 2, learned: false },
      }),
      33,
    );
    assert.equal(
      catalogCoursePercent(card, {
        "line-a": { step: 8, learned: true },
        "line-b": { step: 8, learned: true },
        "line-c": { step: 8, learned: true },
      }),
      100,
    );
  });

  it("reports zero percent for a card with no lines", () => {
    const card = toCatalogCourse({ ...course(), chapters: [] });
    assert.equal(catalogCoursePercent(card, {}), 0);
  });
});
