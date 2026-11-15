import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { duplicateChapter, duplicateVariation, moveListItem, moveListItemTo } from "./draft.ts";
import type { CourseChapter } from "./types.ts";

const chapters: CourseChapter[] = [
  { id: "c1", title: "One", variations: [{ id: "v1", title: "A", pgn: "1. e4" }] },
  { id: "c2", title: "Two", variations: [{ id: "v2", title: "B", pgn: "1. d4" }] },
  { id: "c3", title: "Three", variations: [] },
];

describe("moveListItemTo", () => {
  it("moves the item so it ends at the target index", () => {
    assert.deepEqual(moveListItemTo(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
    assert.deepEqual(moveListItemTo(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  });

  it("ignores a same-index or out-of-range move", () => {
    const items = ["a", "b", "c"];
    assert.equal(moveListItemTo(items, 1, 1), items);
    assert.equal(moveListItemTo(items, -1, 2), items);
    assert.equal(moveListItemTo(items, 0, 3), items);
  });
});

describe("moveListItem (keyboard reorder)", () => {
  it("swaps one step and stops at the ends", () => {
    assert.deepEqual(moveListItem(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
    assert.deepEqual(moveListItem(["a", "b", "c"], 1, 1), ["a", "c", "b"]);
    const items = ["a", "b", "c"];
    assert.equal(moveListItem(items, 0, -1), items);
    assert.equal(moveListItem(items, 2, 1), items);
  });
});

describe("duplicateChapter", () => {
  it("inserts the copy right after the source with fresh ids", () => {
    const next = duplicateChapter(chapters, "c2");
    assert.equal(next.length, 4);
    assert.deepEqual(
      next.map((chapter) => chapter.title),
      ["One", "Two", "Two", "Three"],
    );
    const copy = next[2];
    assert.ok(copy);
    assert.notEqual(copy.id, "c2");
    assert.notEqual(copy.id, next[1]?.id);
    assert.deepEqual(
      copy.variations.map((variation) => variation.title),
      ["B"],
    );
    assert.notEqual(copy.variations[0]?.id, "v2");
    // The source keeps its own ids and content.
    assert.equal(next[1]?.id, "c2");
    assert.equal(next[1]?.variations[0]?.id, "v2");
  });

  it("returns the list unchanged when the chapter is gone", () => {
    assert.equal(duplicateChapter(chapters, "missing"), chapters);
  });
});

describe("duplicateVariation", () => {
  it("inserts the line copy right after the source with a fresh id", () => {
    const chapter = chapters[0];
    assert.ok(chapter);
    const next = duplicateVariation(chapter, "v1");
    assert.equal(next.variations.length, 2);
    assert.equal(next.variations[1]?.title, "A");
    assert.equal(next.variations[1]?.pgn, "1. e4");
    assert.notEqual(next.variations[1]?.id, "v1");
    assert.equal(next.variations[0]?.id, "v1");
  });

  it("returns the chapter unchanged when the line is gone", () => {
    const chapter = chapters[0];
    assert.ok(chapter);
    assert.equal(duplicateVariation(chapter, "missing"), chapter);
  });
});
