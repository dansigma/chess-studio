import { test } from "node:test";
import assert from "node:assert/strict";
import { saveLocalFiles } from "./user-files";

const library = { folders: [], databases: [] };

test("saveLocalFiles reports a full browser storage instead of throwing", () => {
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    },
  };
  try {
    assert.equal(saveLocalFiles(library), false);
  } finally {
    (globalThis as { window?: unknown }).window = original;
  }
});

test("saveLocalFiles returns true when the write succeeds", () => {
  const original = (globalThis as { window?: unknown }).window;
  let written = "";
  (globalThis as { window?: unknown }).window = { localStorage: { setItem: (_k: string, v: string) => (written = v) } };
  try {
    assert.equal(saveLocalFiles(library), true);
    assert.match(written, /databases/);
  } finally {
    (globalThis as { window?: unknown }).window = original;
  }
});
