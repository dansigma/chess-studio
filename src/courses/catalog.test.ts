import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseSlugError, courseThemeLabel, findPublishedConflict, isCourseTheme, mergeCourseLists, parseChapters } from "./catalog.ts";
import { SEED_COURSES } from "./seed.ts";
import type { Course } from "./types.ts";

describe("course catalog", () => {
  it("keeps the built-in course when nothing is published with its address", () => {
    const published: Course[] = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        slug: "french",
        title: "French",
        summary: "",
        theme: "openings",
        color: "black",
        chapters: [],
      },
    ];
    const merged = mergeCourseLists(published, SEED_COURSES);
    assert.deepEqual(
      merged.map((course) => course.slug),
      ["french", "caro-kann"],
    );
  });

  it("accepts the four course themes", () => {
    assert.equal(isCourseTheme("tactics"), true);
    assert.equal(isCourseTheme("opening"), false);
    assert.equal(courseThemeLabel("endgames"), "Endgames");
  });

  it("rejects an address that belongs to another course", () => {
    assert.equal(courseSlugError("caro-kann", SEED_COURSES, "other"), "That address is already used by a course.");
    assert.equal(courseSlugError("caro-kann", SEED_COURSES, "caro-kann"), null);
    assert.equal(courseSlugError("", SEED_COURSES), "The course needs an address.");
  });

  it("drops malformed chapters from a published course", () => {
    const chapters = parseChapters([
      {
        id: "advance",
        title: "Advance",
        variations: [{ id: "line", title: "Main", pgn: "1. e4 c6" }, { id: 1, title: "Bad", pgn: "1. e4" }],
      },
      { id: "skip" },
    ]);
    assert.equal(chapters.length, 1);
    assert.equal(chapters[0]?.variations.length, 1);
    assert.equal(chapters[0]?.variations[0]?.pgn, "1. e4 c6");
  });

  it("finds a published course with the same id", () => {
    const list = [
      { id: "11111111-1111-4111-8111-111111111111", title: "Live course" },
      { id: "22222222-2222-4222-8222-222222222222", title: "Other course" },
    ];
    const found = findPublishedConflict("11111111-1111-4111-8111-111111111111", list);
    assert.equal(found?.title, "Live course");
  });

  it("returns null when no published course shares the id", () => {
    const list = [{ id: "11111111-1111-4111-8111-111111111111", title: "Live course" }];
    assert.equal(findPublishedConflict("33333333-3333-4333-8333-333333333333", list), null);
  });

  it("returns null for invalid ids even on textual match", () => {
    const list = [
      { id: "not-a-uuid", title: "Textual match" },
      { id: "", title: "Empty match" },
    ];
    assert.equal(findPublishedConflict("not-a-uuid", list), null);
    assert.equal(findPublishedConflict("", list), null);
  });
});
