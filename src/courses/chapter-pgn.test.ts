import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chapterTitleFromPgn, variationsFromChapterPgn } from "./chapter-pgn.ts";

const FILE = `[Event "Jobava London"]
[White "White"]
[Black "1...d5"]

{The bishop comes out early.} 1. d4 d5 2. Nc3

[Event "Jobava London"]
[Chapter "2...Nf6"]

{Black develops the knight.} 1. d4 Nf6 2. Nc3 d5
`;

describe("chapter pgn upload", () => {
  it("turns each commented game into a line of the chapter", () => {
    const lines = variationsFromChapterPgn(FILE);
    assert.equal(lines.length, 2);
    assert.equal(lines[0]?.title, "1...d5");
    assert.equal(lines[1]?.title, "2...Nf6");
    assert.match(lines[0]?.pgn ?? "", /Nc3/);
    assert.equal(chapterTitleFromPgn(FILE), "Jobava London");
  });

  it("ignores a file with no moves", () => {
    assert.deepEqual(variationsFromChapterPgn("[Event \"Empty\"]\n\n*"), []);
  });
});