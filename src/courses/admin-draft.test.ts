import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appendChapterPgn, importChapterPgn, type ChapterPgnUpdate } from "./admin-draft.ts";
import type { CourseChapter } from "./types.ts";

const FILE = `[Event "Jobava London"]
[White "White"]
[Black "1...d5"]

{The bishop comes out early.} 1. d4 d5 2. Nc3

[Event "Jobava London"]
[Chapter "2...Nf6"]

{Black develops the knight.} 1. d4 Nf6 2. Nc3 d5
`;

function chapter(id: string, lines: number, title = "Chapter"): CourseChapter {
  return {
    id,
    title,
    variations: Array.from({ length: lines }, (_, index) => ({ id: `${id}-${index}`, title: "", pgn: "" })),
  };
}

describe("importChapterPgn", () => {
  it("returns the parsed lines and the suggested chapter title", () => {
    const result = importChapterPgn(FILE, [chapter("c1", 0, "")], "c1");
    assert.ok(result && "lines" in result);
    assert.equal(result.lines.length, 2);
    assert.equal(result.suggested, "Jobava London");
  });

  it("rejects a file larger than one million characters", () => {
    const result = importChapterPgn("x".repeat(1_000_001), [chapter("c1", 0)], "c1");
    assert.deepEqual(result, { error: { key: "course.admin.error.pgnTooLarge" } });
  });

  it("rejects a file with no playable lines", () => {
    const result = importChapterPgn("[Event \"Empty\"]\n\n*", [chapter("c1", 0)], "c1");
    assert.deepEqual(result, { error: { key: "course.admin.error.pgnNoLines" } });
  });

  it("rejects a file that would push the chapter past 40 lines", () => {
    const result = importChapterPgn(FILE, [chapter("c1", 39)], "c1");
    assert.deepEqual(result, { error: { key: "course.admin.error.tooManyLines" } });
  });

  it("accepts a file that lands exactly on the 40-line cap", () => {
    const result = importChapterPgn(FILE, [chapter("c1", 38)], "c1");
    assert.ok(result && "lines" in result);
  });

  it("returns null when the chapter no longer exists", () => {
    assert.equal(importChapterPgn(FILE, [chapter("other", 0)], "c1"), null);
  });
});

describe("appendChapterPgn", () => {
  const update: ChapterPgnUpdate = {
    lines: [{ id: "v1", title: "1...d5", pgn: "1. d4 d5" }],
    suggested: "Jobava London",
  };

  it("appends the lines and adopts the suggested title when the chapter is untitled", () => {
    const next = appendChapterPgn([chapter("c1", 0, "  ")], "c1", update);
    assert.equal(next[0]?.title, "Jobava London");
    assert.equal(next[0]?.variations.length, 1);
    assert.equal(next[0]?.variations[0]?.id, "v1");
  });

  it("keeps an existing chapter title", () => {
    const next = appendChapterPgn([chapter("c1", 0, "Caro-Kann")], "c1", update);
    assert.equal(next[0]?.title, "Caro-Kann");
  });

  it("leaves other chapters untouched", () => {
    const next = appendChapterPgn([chapter("c1", 0), chapter("c2", 1)], "c2", update);
    assert.equal(next[0]?.variations.length, 0);
    assert.equal(next[1]?.variations.length, 2);
  });
});
