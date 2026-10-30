import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseOwnershipError, courseSlugError, courseThemeLabel, findPublishedConflict, isCourseAccessTier, isCourseStatus, isCourseTheme, isPublishedCourse, mergeCourseLists, outlineChapters, parseChapters, toCourse, toPreviewCourse } from "./catalog.ts";
import { SEED_COURSES } from "./seed-data.ts";
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
        status: "published",
        accessTier: "free",
        priceCents: null,
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
    assert.equal(courseThemeLabel("endgames", "en"), "Endgames");
    assert.equal(courseThemeLabel("endgames", "pt-br"), "Finais");
  });

  it("rejects an address that belongs to another course", () => {
    assert.deepEqual(courseSlugError("caro-kann", SEED_COURSES, "other"), {
      key: "course.admin.error.addressInUse",
    });
    assert.equal(courseSlugError("caro-kann", SEED_COURSES, "caro-kann"), null);
    assert.deepEqual(courseSlugError("", SEED_COURSES), { key: "course.admin.error.needsAddress" });
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

  it("allows publishing a new course without an existing row", () => {
    assert.equal(courseOwnershipError(null, "user-1", false), null);
    assert.equal(courseOwnershipError(undefined, "user-1", false), null);
  });

  it("allows the owner to publish over their own course", () => {
    assert.equal(courseOwnershipError({ created_by: "user-1" }, "user-1", false), null);
  });

  it("rejects a publisher overwriting another publisher's course", () => {
    assert.deepEqual(courseOwnershipError({ created_by: "owner-1" }, "user-2", false), {
      key: "course.admin.error.belongsToOther",
    });
  });

  it("allows a super-admin to publish over any course", () => {
    assert.equal(courseOwnershipError({ created_by: "owner-1" }, "user-2", true), null);
    assert.equal(courseOwnershipError({ created_by: null }, "user-2", true), null);
  });

  it("rejects a non-super-admin mutating an orphan course", () => {
    assert.deepEqual(courseOwnershipError({ created_by: null }, "user-1", false), {
      key: "course.admin.error.noOwner",
    });
  });

  it("maps published_at through toCourse and detects visibility", () => {
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
    };
    const published = toCourse({ ...base, published_at: "2026-10-07T00:00:00.000Z" });
    assert.equal(published?.publishedAt, "2026-10-07T00:00:00.000Z");
    // SIG-1050: legacy rows without status default to published/free.
    assert.equal(published?.status, "published");
    assert.equal(published?.accessTier, "free");
    assert.equal(published?.priceCents, null);
    assert.equal(isPublishedCourse({ published_at: "2026-10-07T00:00:00.000Z" }), true);
    const draft = toCourse({ ...base, published_at: null });
    assert.equal(draft?.publishedAt, null);
    assert.equal(isPublishedCourse({ published_at: null }), false);
  });

  it("prefers status over published_at for visibility (SIG-1050)", () => {
    assert.equal(isPublishedCourse({ status: "published", published_at: null }), true);
    assert.equal(isPublishedCourse({ status: "draft", published_at: "2026-10-07T00:00:00.000Z" }), false);
    for (const status of ["draft", "in_review", "rejected", "archived"] as const) {
      assert.equal(isPublishedCourse({ status, published_at: "2026-10-07T00:00:00.000Z" }), false);
    }
    assert.equal(isPublishedCourse({ status: "published", publishedAt: null }), true);
    assert.equal(isPublishedCourse({ status: "in_review", publishedAt: "2026-10-07T00:00:00.000Z" }), false);
  });

  it("maps the status and tier columns through toCourse (SIG-1050)", () => {
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
    const paid = toCourse({
      ...base,
      status: "in_review",
      access_tier: "paid",
      price_cents: 1990,
      currency: "BRL",
      author_display_name: "Coach Ana",
      review_note: "Needs a better intro",
    });
    assert.equal(paid?.status, "in_review");
    assert.equal(paid?.accessTier, "paid");
    assert.equal(paid?.priceCents, 1990);
    assert.equal(paid?.authorName, "Coach Ana");
    assert.equal(paid?.reviewNote, "Needs a better intro");
    assert.equal(isPublishedCourse({ status: paid!.status, published_at: "2026-10-07T00:00:00.000Z" }), false);
  });

  it("rejects unknown status or tier values in toCourse (SIG-1050)", () => {
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
    assert.equal(toCourse({ ...base, status: "live" }), null);
    assert.equal(toCourse({ ...base, access_tier: "gold" }), null);
    assert.equal(isCourseStatus("published"), true);
    assert.equal(isCourseStatus("live"), false);
    assert.equal(isCourseAccessTier("paid"), true);
    assert.equal(isCourseAccessTier("gold"), false);
  });

  it("builds unlockable chapters from the outline with empty PGN (SIG-1119)", () => {
    const outline = [
      {
        id: "advance",
        title: "Advance",
        variations: [{ id: "line", title: "Main" }, { id: 1, title: "Bad", pgn: "1. e4" }],
      },
      { id: "skip" },
    ];
    const chapters = outlineChapters(outline);
    assert.equal(chapters.length, 1);
    assert.equal(chapters[0]?.variations.length, 1);
    assert.equal(chapters[0]?.variations[0]?.pgn, "");
    assert.equal(chapters[0]?.variations[0]?.title, "Main");
  });

  it("marks outline-built courses contentLoaded false without PGN text (SIG-1119)", () => {
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "french",
      title: "French",
      summary: "",
      cover_url: null,
      video_url: null,
      theme: "openings",
      color: "black",
      published_at: "2026-10-07T00:00:00.000Z",
      status: "published",
      access_tier: "free",
      outline: [
        {
          id: "advance",
          title: "Advance",
          variations: [{ id: "line", title: "Main" }],
        },
      ],
    };
    const course = toCourse(row);
    assert.equal(course?.contentLoaded, false);
    assert.equal(course?.chapters[0]?.variations[0]?.pgn, "");
    assert.equal(course?.chapters[0]?.variations[0]?.title, "Main");
    // The static HTML carries titles only: no move text leaks through PGN.
    assert.ok(!JSON.stringify(course?.chapters ?? []).match(/[1-9]\.\s*[a-hNBRQKO]/));
  });

  it("builds full-PGN preview courses with contentLoaded true (SIG-1115)", () => {
    const base = {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "london-system",
      title: "London System",
      summary: "A solid opening.",
      cover_url: null,
      video_url: null,
      theme: "openings",
      color: "white",
      published_at: null,
      status: "in_review",
      access_tier: "free",
      outline: [],
    };
    const preview = toPreviewCourse({
      ...base,
      chapters: [{ id: "c1", title: "Basics", variations: [{ id: "v1", title: "Main", pgn: "1. d4 d5 2. Bf4" }] }],
    });
    assert.equal(preview?.contentLoaded, true);
    assert.equal(preview?.status, "in_review");
    assert.equal(preview?.chapters[0]?.variations[0]?.pgn, "1. d4 d5 2. Bf4");
  });

  it("rejects unknown tier values in toPreviewCourse (SIG-1115)", () => {
    const base = {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "london-system",
      title: "London",
      summary: "",
      cover_url: null,
      video_url: null,
      theme: "openings",
      color: "white",
      published_at: null,
      status: "in_review",
      outline: [],
    };
    assert.equal(toPreviewCourse({ ...base, access_tier: "gold", chapters: [] }), null);
    assert.equal(toPreviewCourse({ ...base, access_tier: "free", status: "live", chapters: [] }), null);
  });
});
