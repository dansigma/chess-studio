import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CUSTOM_COURSES_KEY, readRawCache, writeRawCache } from "../lib/local-cache.ts";
import { readLocalCustomCourses, removeLocalCustomDraft, toLocalDraftCourse } from "./store.ts";
import type { Course } from "./types.ts";

// SIG-882: removeLocalCustomDraft reports whether browser storage reflects
// the removal, so the admin import flow can warn instead of silently
// diverging React state from localStorage.
//
// The store modules no-op without a browser window, so a Map-backed
// localStorage is installed here — after the imports, so module init
// sees no browser. node --test runs each file in its own process, so
// the stub cannot leak into other suites.
const storage = new Map<string, string>();

let setItemImpl = (key: string, value: string): void => {
  storage.set(key, String(value));
};
let removeItemImpl = (key: string): void => {
  storage.delete(key);
};

function installWindow(): void {
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => setItemImpl(key, value),
      removeItem: (key: string) => removeItemImpl(key),
    },
  };
}

installWindow();

function makeDraft(id: string): Course {
  return {
    id,
    slug: `slug-${id.slice(0, 8)}`,
    title: `title ${id.slice(0, 8)}`,
    summary: "",
    theme: "openings",
    color: "white",
    chapters: [],
  };
}

// Valid v4 UUIDs for the isCourseId gate in toLocalDraftCourse.
const DRAFT_A = "11111111-1111-4111-8111-111111111111";
const DRAFT_B = "22222222-2222-4222-8222-222222222222";

function resetStorage(): void {
  storage.clear();
  setItemImpl = (key, value) => {
    storage.set(key, String(value));
  };
  removeItemImpl = (key) => {
    storage.delete(key);
  };
}

function seed(...drafts: Course[]): void {
  writeRawCache(CUSTOM_COURSES_KEY, JSON.stringify(drafts));
}

describe("removeLocalCustomDraft", () => {
  it("persists the removal and returns true when other drafts remain", () => {
    resetStorage();
    seed(makeDraft(DRAFT_A), makeDraft(DRAFT_B));

    assert.equal(removeLocalCustomDraft(DRAFT_A), true);
    assert.deepEqual(
      readLocalCustomCourses().map((course) => course.id),
      [DRAFT_B],
    );
  });

  it("deletes the key and returns true when the last draft is removed", () => {
    resetStorage();
    seed(makeDraft(DRAFT_A));

    assert.equal(removeLocalCustomDraft(DRAFT_A), true);
    assert.equal(readRawCache(CUSTOM_COURSES_KEY), null);
  });

  it("returns false when the storage write throws", () => {
    resetStorage();
    seed(makeDraft(DRAFT_A), makeDraft(DRAFT_B));
    setItemImpl = () => {
      throw new Error("quota exceeded");
    };

    assert.equal(removeLocalCustomDraft(DRAFT_A), false);
    assert.deepEqual(
      readLocalCustomCourses().map((course) => course.id),
      [DRAFT_A, DRAFT_B],
    );
  });

  it("returns false when the storage write silently does not persist", () => {
    resetStorage();
    seed(makeDraft(DRAFT_A), makeDraft(DRAFT_B));
    // writeRawCache swallows storage errors by design, so a no-op setItem
    // only surfaces through the read-back verification.
    setItemImpl = () => {};

    assert.equal(removeLocalCustomDraft(DRAFT_A), false);
  });

  it("returns false when removing the last draft does not clear the key", () => {
    resetStorage();
    seed(makeDraft(DRAFT_A));
    removeItemImpl = () => {
      throw new Error("storage blocked");
    };

    assert.equal(removeLocalCustomDraft(DRAFT_A), false);
    assert.notEqual(readRawCache(CUSTOM_COURSES_KEY), null);
  });

  it("returns true without a browser window", () => {
    resetStorage();
    const globalWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      assert.equal(removeLocalCustomDraft(DRAFT_A), true);
    } finally {
      (globalThis as { window?: unknown }).window = globalWindow;
    }
  });

  it("returns true when the id is not stored", () => {
    resetStorage();
    seed(makeDraft(DRAFT_A));

    assert.equal(removeLocalCustomDraft("missing"), true);
    assert.deepEqual(
      readLocalCustomCourses().map((course) => course.id),
      [DRAFT_A],
    );
  });
});

describe("readLocalCustomCourses validation", () => {
  it("returns [] for non-array, null, and malformed top-level values", () => {
    for (const raw of ['{"id":"x"}', "null", '"text"', "42"]) {
      resetStorage();
      writeRawCache(CUSTOM_COURSES_KEY, raw);
      assert.deepEqual(readLocalCustomCourses(), []);
    }
    resetStorage();
    writeRawCache(CUSTOM_COURSES_KEY, JSON.stringify([null, 42, "text", []]));
    assert.deepEqual(readLocalCustomCourses(), []);
  });

  it("drops rows with garbage ids and keeps valid drafts", () => {
    resetStorage();
    writeRawCache(
      CUSTOM_COURSES_KEY,
      JSON.stringify([{ ...makeDraft(DRAFT_A), id: "draft-a" }, makeDraft(DRAFT_B)]),
    );

    assert.deepEqual(
      readLocalCustomCourses().map((course) => course.id),
      [DRAFT_B],
    );
  });

  it("drops rows with bad theme or color", () => {
    resetStorage();
    const badTheme = { ...makeDraft(DRAFT_A), theme: "blitz" };
    const badColor = { ...makeDraft(DRAFT_B), color: "green" };
    const missingTheme = { ...makeDraft(DRAFT_A) };
    delete (missingTheme as { theme?: unknown }).theme;
    writeRawCache(CUSTOM_COURSES_KEY, JSON.stringify([badTheme, badColor, missingTheme]));

    assert.deepEqual(readLocalCustomCourses(), []);
  });

  it("coerces missing or non-string text fields to empty strings", () => {
    resetStorage();
    const loose = {
      id: DRAFT_A,
      theme: "openings",
      color: "white",
      slug: 42,
      title: null,
      summary: { html: "x" },
      chapters: [],
    };
    writeRawCache(CUSTOM_COURSES_KEY, JSON.stringify([loose]));

    assert.deepEqual(readLocalCustomCourses(), [{ ...makeDraft(DRAFT_A), slug: "", title: "", summary: "" }]);
  });

  it("cleans junk chapter entries via parseChapters", () => {
    resetStorage();
    const draft = {
      ...makeDraft(DRAFT_A),
      chapters: [
        null,
        { id: "c-1", title: "One", variations: [{ id: "v-1", title: "Line", pgn: "1. e4 e5" }, null] },
        { id: "c-bad", title: 42 },
      ],
    };
    writeRawCache(CUSTOM_COURSES_KEY, JSON.stringify([draft]));

    assert.deepEqual(readLocalCustomCourses(), [
      {
        ...makeDraft(DRAFT_A),
        chapters: [{ id: "c-1", title: "One", variations: [{ id: "v-1", title: "Line", pgn: "1. e4 e5" }] }],
      },
    ]);
  });

  it("keeps optional cover, video, builtin, and publishedAt passthroughs", () => {
    resetStorage();
    const draft = {
      ...makeDraft(DRAFT_A),
      coverUrl: "https://example.com/cover.png",
      videoUrl: 42,
      builtin: true,
      publishedAt: null,
    };
    writeRawCache(CUSTOM_COURSES_KEY, JSON.stringify([draft]));

    assert.deepEqual(readLocalCustomCourses(), [
      { ...makeDraft(DRAFT_A), coverUrl: "https://example.com/cover.png", builtin: true, publishedAt: null },
    ]);
  });

  it("toLocalDraftCourse returns null for non-objects", () => {
    assert.equal(toLocalDraftCourse(null), null);
    assert.equal(toLocalDraftCourse([]), null);
    assert.equal(toLocalDraftCourse("text"), null);
  });
});
