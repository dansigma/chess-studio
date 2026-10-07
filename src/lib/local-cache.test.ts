import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COURSE_PROGRESS_KEY,
  COURSE_PROGRESS_OWNER_KEY,
  CUSTOM_COURSES_KEY,
  PUZZLE_PROGRESS_KEY,
  isCourseProgressOwnedBy,
  purgeUserLocalCaches,
  readCourseProgressOwner,
  readJsonCache,
  removeRawCache,
  writeCourseProgressOwner,
  writeRawCache,
} from "./local-cache.ts";
import { hydrateProgress, loadProgress } from "../courses/store.ts";
import { useStudioStore } from "../store/studio-store.ts";

// SIG-886: per-user namespacing/purge of the studio's local caches.
// Behavioral criteria: (a) A's local data never enters account B;
// (b) anonymous -> login keeps merging the trial progress once;
// (c) A->signout->B and A->B direct leave B with none of A's data;
// (d) A logging back in recovers progress from remote (server-side;
// proven here up to the local-cache half: purge + rebuild).
//
// The store modules no-op without a browser window, so a Map-backed
// localStorage is installed here — after the imports, so module init
// sees no browser. node --test runs each file in its own process, so
// the stub cannot leak into other suites.
const storage = new Map<string, string>();
const writes: string[] = [];

function installWindow(): void {
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, String(value));
        writes.push(key);
      },
      removeItem: (key: string) => {
        storage.delete(key);
        writes.push(key);
      },
    },
  };
}

installWindow();

const USER_A = { id: "user-a", email: "a@example.com" };
const USER_B = { id: "user-b", email: "b@example.com" };

const TRIAL = { v1: { step: 3, learned: false } };
const A_PROGRESS = { v9: { step: 5, learned: true } };

async function resetAll(): Promise<void> {
  storage.clear();
  writes.length = 0;
  useStudioStore.setState({ user: null });
  await hydrateProgress(null);
  storage.clear();
  writes.length = 0;
}

describe("purgeUserLocalCaches", () => {
  it("removes the three caches plus the owner marker", async () => {
    await resetAll();
    writeRawCache(COURSE_PROGRESS_KEY, JSON.stringify(A_PROGRESS));
    writeRawCache(CUSTOM_COURSES_KEY, JSON.stringify([{ id: "draft-a" }]));
    writeRawCache(PUZZLE_PROGRESS_KEY, JSON.stringify({ rating: 1500 }));
    writeCourseProgressOwner("user-a");

    purgeUserLocalCaches();

    assert.equal(storage.get(COURSE_PROGRESS_KEY), undefined);
    assert.equal(storage.get(CUSTOM_COURSES_KEY), undefined);
    assert.equal(storage.get(PUZZLE_PROGRESS_KEY), undefined);
    assert.equal(storage.get(COURSE_PROGRESS_OWNER_KEY), undefined);
  });

  it("writes nothing when the caches are already absent", async () => {
    await resetAll();
    writes.length = 0;
    purgeUserLocalCaches();
    assert.deepEqual(writes, []);
  });

  it("no-ops without a browser window", async () => {
    await resetAll();
    const globalWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      purgeUserLocalCaches();
      writeCourseProgressOwner("user-a");
      assert.equal(readCourseProgressOwner(), null);
    } finally {
      (globalThis as { window?: unknown }).window = globalWindow;
    }
  });
});

describe("course progress owner guard", () => {
  it("treats unmarked (anonymous trial / legacy) data as mergeable by anyone", async () => {
    await resetAll();
    assert.equal(isCourseProgressOwnedBy(null), true);
    assert.equal(isCourseProgressOwnedBy("user-a"), true);
  });

  it("scopes marked data to its owner only", async () => {
    await resetAll();
    writeCourseProgressOwner("user-a");
    assert.equal(isCourseProgressOwnedBy("user-a"), true);
    assert.equal(isCourseProgressOwnedBy("user-b"), false);
    assert.equal(isCourseProgressOwnedBy(null), false);
  });

  it("clearing the owner (sign-out) returns the key to mergeable", async () => {
    await resetAll();
    writeCourseProgressOwner("user-a");
    writeCourseProgressOwner(null);
    assert.equal(readCourseProgressOwner(), null);
    assert.equal(isCourseProgressOwnedBy("user-b"), true);
  });
});

describe("SIG-886 flows (a)-(d)", () => {
  it("(a) A's local progress is never merged into B's account", async () => {
    await resetAll();
    // Supabase is unconfigured in this suite, so hydrate takes the
    // local-fallback path — the same path that used to upsert A's rows
    // under B's user_id once a client existed.
    writeRawCache(COURSE_PROGRESS_KEY, JSON.stringify(A_PROGRESS));
    writeCourseProgressOwner("user-a");

    const merged = await hydrateProgress("user-b");

    assert.deepEqual(merged, {});
    assert.deepEqual(loadProgress(), {});
  });

  it("(b) anonymous trial progress still merges once on login", async () => {
    await resetAll();
    writeRawCache(COURSE_PROGRESS_KEY, JSON.stringify(TRIAL));

    const merged = await hydrateProgress("user-b");

    assert.deepEqual(merged, TRIAL);
    assert.equal(readCourseProgressOwner(), "user-b");
  });

  it("(c) A->B direct purges every cache and the in-memory progress", async () => {
    await resetAll();
    useStudioStore.getState().setUser(USER_A);
    writeRawCache(COURSE_PROGRESS_KEY, JSON.stringify(A_PROGRESS));
    writeCourseProgressOwner("user-a");
    writeRawCache(CUSTOM_COURSES_KEY, JSON.stringify([{ id: "draft-a" }]));
    writeRawCache(PUZZLE_PROGRESS_KEY, JSON.stringify({ rating: 1500 }));
    await hydrateProgress("user-a");
    assert.deepEqual(loadProgress(), A_PROGRESS);

    useStudioStore.getState().setUser(USER_B);

    assert.equal(storage.get(COURSE_PROGRESS_KEY), undefined);
    assert.equal(storage.get(CUSTOM_COURSES_KEY), undefined);
    assert.equal(storage.get(PUZZLE_PROGRESS_KEY), undefined);
    assert.equal(storage.get(COURSE_PROGRESS_OWNER_KEY), undefined);
    assert.deepEqual(loadProgress(), {});
    assert.deepEqual(readJsonCache<unknown>(CUSTOM_COURSES_KEY, []), []);
  });

  it("(c) A->signout->B leaves B with none of A's data", async () => {
    await resetAll();
    useStudioStore.getState().setUser(USER_A);
    writeRawCache(COURSE_PROGRESS_KEY, JSON.stringify(A_PROGRESS));
    writeCourseProgressOwner("user-a");
    writeRawCache(CUSTOM_COURSES_KEY, JSON.stringify([{ id: "draft-a" }]));
    writeRawCache(PUZZLE_PROGRESS_KEY, JSON.stringify({ rating: 1500 }));
    await hydrateProgress("user-a");

    useStudioStore.getState().setUser(null);

    assert.equal(storage.get(COURSE_PROGRESS_KEY), undefined);
    assert.equal(storage.get(CUSTOM_COURSES_KEY), undefined);
    assert.equal(storage.get(PUZZLE_PROGRESS_KEY), undefined);
    assert.deepEqual(loadProgress(), {});

    // B signs in afterwards: null -> B runs no reset, but there is
    // nothing left to leak, and B's own writes stamp B as owner.
    useStudioStore.getState().setUser(USER_B);
    const merged = await hydrateProgress("user-b");
    assert.deepEqual(merged, {});
    removeRawCache(CUSTOM_COURSES_KEY);
    void merged;
  });

  it("(d) the local cache rebuilds for the signing-in account", async () => {
    await resetAll();
    useStudioStore.getState().setUser(USER_A);
    await hydrateProgress("user-a");
    useStudioStore.getState().setUser(USER_B);

    const merged = await hydrateProgress("user-b");
    assert.deepEqual(merged, {});
    // Remote rows are untouched by the purge; the hydrate writes the
    // merged (here: empty-remote) progress back under B's ownership so
    // the next login recovers it from remote first.
    assert.equal(readCourseProgressOwner(), "user-b");
  });

  it("null -> account sign-in preserves guest work (no purge)", async () => {
    await resetAll();
    writeRawCache(COURSE_PROGRESS_KEY, JSON.stringify(TRIAL));
    writes.length = 0;

    useStudioStore.getState().setUser(USER_B);

    assert.deepEqual(readJsonCache(COURSE_PROGRESS_KEY, {}), TRIAL);
    const merged = await hydrateProgress("user-b");
    assert.deepEqual(merged, TRIAL);
  });
});
