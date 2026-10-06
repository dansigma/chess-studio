import assert from "node:assert/strict";
import test from "node:test";
import { selectFileDatabase } from "./select-file-database.ts";

function database(id: string, name = id) {
  return { id, remoteId: null, name, folderId: null, games: [] };
}

test("selectFileDatabase returns the database matching the active id", () => {
  const databases = [database("a"), database("b")];
  assert.equal(selectFileDatabase(databases, "b"), databases[1]);
});

test("selectFileDatabase returns null for an unknown id instead of the last database", () => {
  const databases = [database("a"), database("b")];
  assert.equal(selectFileDatabase(databases, "gone"), null);
});

test("selectFileDatabase returns null when no database is active", () => {
  const databases = [database("a")];
  assert.equal(selectFileDatabase(databases, null), null);
});

test("selectFileDatabase returns null for an empty library", () => {
  assert.equal(selectFileDatabase([], "a"), null);
});
