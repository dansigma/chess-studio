import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  REFERENCE_SOURCE_KEY,
  libraryToExplorerSource,
  loadReferenceSource,
  resolveReferenceSource,
  saveReferenceSource,
} from "./reference-source";

type G = { window?: unknown };
afterEach(() => {
  delete (globalThis as G).window;
});
const fakeWindow = (store: Record<string, string>, broken = false) => {
  (globalThis as G).window = {
    localStorage: {
      getItem: (k: string) => {
        if (broken) throw new Error("denied");
        return store[k] ?? null;
      },
      setItem: (k: string, v: string) => {
        if (broken) throw new Error("denied");
        store[k] = v;
      },
    },
  };
};

test("maps library ids to explorer sources", () => {
  assert.equal(libraryToExplorerSource("masters"), "masters");
  assert.equal(libraryToExplorerSource("file:abc"), "file:abc");
  assert.equal(libraryToExplorerSource("my-games"), null);
});

test("resolve keeps known sources and falls back to masters for missing files", () => {
  assert.equal(resolveReferenceSource(null, []), "masters");
  assert.equal(resolveReferenceSource("lichess", []), "lichess");
  assert.equal(resolveReferenceSource("file:a", ["a"]), "file:a");
  assert.equal(resolveReferenceSource("file:a", ["b"]), "masters");
});

test("save and load round trip through localStorage", () => {
  const store: Record<string, string> = {};
  fakeWindow(store);
  saveReferenceSource("file:a");
  assert.equal(store[REFERENCE_SOURCE_KEY], "file:a");
  assert.equal(loadReferenceSource(), "file:a");
  store[REFERENCE_SOURCE_KEY] = "garbage";
  assert.equal(loadReferenceSource(), null);
});

test("broken localStorage falls back to memory", () => {
  fakeWindow({}, true);
  saveReferenceSource("lichess");
  assert.equal(loadReferenceSource(), "lichess");
});
