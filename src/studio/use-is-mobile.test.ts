import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MOBILE_MAX_WIDTH, mobileQuery, watchMobileMedia } from "./use-is-mobile.ts";

type FakeMedia = {
  matches: boolean;
  query: string;
  listeners: Set<() => void>;
  addEventListener?: (type: string, fn: () => void) => void;
  removeEventListener?: (type: string, fn: () => void) => void;
  addListener?: (fn: () => void) => void;
  removeListener?: (fn: () => void) => void;
  fire: () => void;
};

function fakeMedia(matches: boolean, modern = true): FakeMedia {
  const listeners = new Set<() => void>();
  const media: FakeMedia = {
    matches,
    query: "",
    listeners,
    removeListener: (fn) => listeners.delete(fn),
    fire: () => {
      for (const fn of [...listeners]) fn();
    },
  };
  if (modern) {
    media.addEventListener = (_type, fn) => listeners.add(fn);
    media.removeEventListener = (_type, fn) => listeners.delete(fn);
  } else {
    media.addListener = (fn) => listeners.add(fn);
  }
  return media;
}

function installMatchMedia(media: FakeMedia): { queries: string[] } {
  const queries: string[] = [];
  const stub = {
    matchMedia: (query: string) => {
      queries.push(query);
      media.query = query;
      return media;
    },
  };
  Object.defineProperty(globalThis, "window", { value: stub, configurable: true });
  return { queries };
}

function uninstallWindow() {
  // node --test has no DOM; restore the pre-test (window-less) state.
  Reflect.deleteProperty(globalThis, "window");
}

describe("mobile breakpoint (SIG-1043)", () => {
  test("exports the 767 px single source of truth", () => {
    assert.equal(MOBILE_MAX_WIDTH, 767);
  });

  test("builds the max-width media query from the constant", () => {
    assert.equal(mobileQuery(), "(max-width: 767px)");
    assert.equal(mobileQuery(MOBILE_MAX_WIDTH), "(max-width: 767px)");
  });

  test("accepts an explicit width override", () => {
    assert.equal(mobileQuery(500), "(max-width: 500px)");
  });

  test("updates to matches on subscribe and flips on change events", () => {
    const media = fakeMedia(true);
    const { queries } = installMatchMedia(media);
    try {
      const seen: boolean[] = [];
      const cleanup = watchMobileMedia((value) => seen.push(value));
      assert.deepEqual(queries, [mobileQuery()]);
      assert.deepEqual(seen, [true]);
      media.matches = false;
      media.fire();
      assert.deepEqual(seen, [true, false]);
      cleanup();
      media.matches = true;
      media.fire();
      assert.deepEqual(seen, [true, false]);
    } finally {
      uninstallWindow();
    }
  });

  test("supports the legacy addListener API", () => {
    const media = fakeMedia(false, false);
    installMatchMedia(media);
    try {
      const seen: boolean[] = [];
      const cleanup = watchMobileMedia((value) => seen.push(value));
      assert.deepEqual(seen, [false]);
      media.matches = true;
      media.fire();
      assert.deepEqual(seen, [false, true]);
      cleanup();
      assert.equal(media.listeners.size, 0);
    } finally {
      uninstallWindow();
    }
  });

  test("no-ops without a window (SSR)", () => {
    const cleanup = watchMobileMedia(() => {
      throw new Error("setter must not run without window");
    });
    cleanup();
  });
});
