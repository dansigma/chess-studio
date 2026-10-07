import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CUSTOM_COURSES_KEY, readRawCache, writeRawCache } from "../lib/local-cache.ts";
import { readLocalCustomCourses, removeLocalCustomDraft } from "./store.ts";
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
    slug: `slug-${id}`,
    title: `title ${id}`,
    summary: "",
    theme: "openings",
    color: "white",
    chapters: [],
  };
}

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
    seed(makeDraft("a"), makeDraft("b"));

    assert.equal(removeLocalCustomDraft("a"), true);
    assert.deepEqual(
      readLocalCustomCourses().map((course) => course.id),
      ["b"],
    );
  });

  it("deletes the key and returns true when the last draft is removed", () => {
    resetStorage();
    seed(makeDraft("a"));

    assert.equal(removeLocalCustomDraft("a"), true);
    assert.equal(readRawCache(CUSTOM_COURSES_KEY), null);
  });

  it("returns false when the storage write throws", () => {
    resetStorage();
    seed(makeDraft("a"), makeDraft("b"));
    setItemImpl = () => {
      throw new Error("quota exceeded");
    };

    assert.equal(removeLocalCustomDraft("a"), false);
    assert.deepEqual(
      readLocalCustomCourses().map((course) => course.id),
      ["a", "b"],
    );
  });

  it("returns false when the storage write silently does not persist", () => {
    resetStorage();
    seed(makeDraft("a"), makeDraft("b"));
    // writeRawCache swallows storage errors by design, so a no-op setItem
    // only surfaces through the read-back verification.
    setItemImpl = () => {};

    assert.equal(removeLocalCustomDraft("a"), false);
  });

  it("returns false when removing the last draft does not clear the key", () => {
    resetStorage();
    seed(makeDraft("a"));
    removeItemImpl = () => {
      throw new Error("storage blocked");
    };

    assert.equal(removeLocalCustomDraft("a"), false);
    assert.notEqual(readRawCache(CUSTOM_COURSES_KEY), null);
  });

  it("returns true without a browser window", () => {
    resetStorage();
    const globalWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      assert.equal(removeLocalCustomDraft("a"), true);
    } finally {
      (globalThis as { window?: unknown }).window = globalWindow;
    }
  });

  it("returns true when the id is not stored", () => {
    resetStorage();
    seed(makeDraft("a"));

    assert.equal(removeLocalCustomDraft("missing"), true);
    assert.deepEqual(
      readLocalCustomCourses().map((course) => course.id),
      ["a"],
    );
  });
});
