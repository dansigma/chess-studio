import { test } from "node:test";
import assert from "node:assert/strict";
import { databaseExportFilename, databaseToPgn } from "./export-database-pgn.ts";

const db = (name: string, pgns: string[]) =>
  ({ id: "x", remoteId: null, name, folderId: null, games: pgns.map((pgn) => ({ pgn })) }) as never;

test("joins every game with a blank line", () => {
  assert.equal(databaseToPgn(db("a", ["1. e4 *\n", " 1. d4 * "])), "1. e4 *\n\n1. d4 *\n");
});

test("filename strips hostile characters and falls back", () => {
  assert.equal(databaseExportFilename(db('a/b\\c:d*e?f"g<h>i|j', [])), "abcdefghij.pgn");
  assert.equal(databaseExportFilename(db("///", [])), "database.pgn");
});
