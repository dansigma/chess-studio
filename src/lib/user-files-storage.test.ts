import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLocalFiles, saveLocalFiles, type FilesLibrary } from "./user-files";

const library = { folders: [], databases: [] };

test("saveLocalFiles reports a full browser storage instead of throwing", async () => {
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    },
  };
  try {
    assert.equal(await saveLocalFiles(library), false);
  } finally {
    (globalThis as { window?: unknown }).window = original;
  }
});

test("saveLocalFiles returns true when the write succeeds", async () => {
  const original = (globalThis as { window?: unknown }).window;
  let written = "";
  (globalThis as { window?: unknown }).window = { localStorage: { setItem: (_k: string, v: string) => (written = v) } };
  try {
    assert.equal(await saveLocalFiles(library), true);
    assert.match(written, /databases/);
  } finally {
    (globalThis as { window?: unknown }).window = original;
  }
});

test("migrates a legacy Library only after IndexedDB commits every game", async () => {
  const original = (globalThis as { window?: unknown }).window;
  const legacy: FilesLibrary = {
    folders: [{ id: "folder", name: "Folder", parentId: null }],
    databases: [{
      id: "db", name: "Database", remoteId: null, folderId: "folder",
      games: [{
        id: "game", white: "White", black: "Black", title: "White vs Black",
        date: "", event: "", result: "*", pgn: "1. e4 e5 *",
      }],
    }],
  };
  let raw: string | null = JSON.stringify(legacy);
  let saved: FilesLibrary | undefined;
  (globalThis as { window?: unknown }).window = { localStorage: {
    getItem: () => raw,
    removeItem: () => { raw = null; },
  } };
  const read = async () => saved;
  try {
    assert.deepEqual(await loadLocalFiles({
      read,
      write: async () => { throw new DOMException("quota", "QuotaExceededError"); },
    }), legacy);
    assert.ok(raw, "legacy data remains after a failed write");

    assert.deepEqual(await loadLocalFiles({
      read,
      write: async (files) => {
        assert.ok(raw, "legacy data still exists when the write begins");
        saved = structuredClone(files);
      },
    }), legacy);
    assert.equal(raw, null);
    assert.deepEqual(await loadLocalFiles({
      read,
      write: async () => assert.fail("must not re-migrate"),
    }), legacy);
  } finally {
    (globalThis as { window?: unknown }).window = original;
  }
});
