import { test } from "node:test";
import assert from "node:assert/strict";
import { importPgnFiles, splitPgnFiles } from "./pgn-import-queue";

const file = (name: string, text = "1. e4 *") => new File([text], name);

test("splits .pgn (case-insensitive) from skipped files", () => {
  const { pgn, skipped } = splitPgnFiles([file("a.pgn"), file("B.PGN"), file("c.txt"), file("d.zip")]);
  assert.deepEqual(pgn.map((f) => f.name), ["a.pgn", "B.PGN"]);
  assert.deepEqual(skipped, ["c.txt", "d.zip"]);
});

test("imports sequentially in order, named without the extension", async () => {
  const calls: string[] = [];
  const result = await importPgnFiles([file("one.pgn", "X"), file("Two.PGN", "Y"), file("n.txt")], {
    importDatabase: (name, pgn) => {
      calls.push(`${name}:${pgn}`);
      return `id-${calls.length}`;
    },
  });
  assert.deepEqual(calls, ["one:X", "Two:Y"]);
  assert.deepEqual(result, { importedIds: ["id-1", "id-2"], skipped: ["n.txt"] });
});

test("only non-pgn files import nothing", async () => {
  let called = false;
  const result = await importPgnFiles([file("a.txt")], { importDatabase: () => ((called = true), "x") });
  assert.equal(called, false);
  assert.deepEqual(result, { importedIds: [], skipped: ["a.txt"] });
});
