import assert from "node:assert/strict";
import test from "node:test";
import {
  arrowsForRender,
  colorFromModifiers,
  compactMarks,
  emptyMarks,
  formatCommentWithMarks,
  formatMarksPgn,
  marksAreEmpty,
  marksFromPgnArrays,
  mergeMarks,
  parseMarksFromComment,
  stripMarkTokens,
  toggleArrowMark,
  toggleSquareMark,
} from "./marks.ts";

test("emptyMarks and marksAreEmpty handle empty and undefined", () => {
  assert.deepEqual(emptyMarks(), { squares: [], arrows: [] });
  assert.equal(marksAreEmpty(emptyMarks()), true);
  assert.equal(marksAreEmpty(undefined), true);
  assert.equal(
    marksAreEmpty({ squares: [{ color: "G", square: "e4" }], arrows: [] }),
    false,
  );
});

test("toggleSquareMark adds, recolors and removes squares", () => {
  const added = toggleSquareMark(emptyMarks(), "e4", "G");
  assert.deepEqual(added.squares, [{ color: "G", square: "e4" }]);
  // same square + same color removes
  assert.deepEqual(toggleSquareMark(added, "e4", "G").squares, []);
  // same square + different color recolors
  const recolored = toggleSquareMark(added, "e4", "R");
  assert.deepEqual(recolored.squares, [{ color: "R", square: "e4" }]);
  // invalid squares are ignored
  assert.deepEqual(toggleSquareMark(emptyMarks(), "i9", "G"), emptyMarks());
});

test("toggleSquareMark keeps other squares", () => {
  const marks = toggleSquareMark(toggleSquareMark(emptyMarks(), "e4", "G"), "d5", "Y");
  assert.equal(marks.squares.length, 2);
  const removed = toggleSquareMark(marks, "e4", "G");
  assert.deepEqual(
    removed.squares.map((s) => s.square),
    ["d5"],
  );
});

test("toggleArrowMark adds, recolors and removes arrows", () => {
  const added = toggleArrowMark(emptyMarks(), "e2", "e4", "G");
  assert.deepEqual(added.arrows, [{ color: "G", from: "e2", to: "e4" }]);
  assert.deepEqual(toggleArrowMark(added, "e2", "e4", "G").arrows, []);
  const recolored = toggleArrowMark(added, "e2", "e4", "B");
  assert.deepEqual(recolored.arrows, [{ color: "B", from: "e2", to: "e4" }]);
});

test("toggleArrowMark rejects invalid arrows", () => {
  assert.deepEqual(toggleArrowMark(emptyMarks(), "e2", "e2", "G"), emptyMarks());
  assert.deepEqual(toggleArrowMark(emptyMarks(), "i9", "e4", "G"), emptyMarks());
});

test("colorFromModifiers maps modifier keys to colors", () => {
  const base = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
  assert.equal(colorFromModifiers(base), "G");
  assert.equal(colorFromModifiers({ ...base, shiftKey: true }), "Y");
  assert.equal(colorFromModifiers({ ...base, altKey: true }), "Y");
  assert.equal(colorFromModifiers({ ...base, ctrlKey: true }), "R");
  assert.equal(colorFromModifiers({ ...base, metaKey: true }), "R");
  // ctrl wins over shift
  assert.equal(
    colorFromModifiers({ ...base, ctrlKey: true, shiftKey: true }),
    "R",
  );
});

test("arrowsForRender maps colors to hex and dedupes", () => {
  const rendered = arrowsForRender([{ color: "G", from: "e2", to: "e4" }]);
  assert.deepEqual(rendered, [{ startSquare: "e2", endSquare: "e4", color: "#22c55e" }]);
  // duplicate from+to collapses
  const dupes = arrowsForRender([
    { color: "G", from: "e2", to: "e4" },
    { color: "R", from: "e2", to: "e4" },
  ]);
  assert.equal(dupes.length, 1);
  // invalid and self arrows are skipped
  assert.deepEqual(arrowsForRender([{ color: "G", from: "e2", to: "e2" }]), []);
  // preview arrow is appended
  const withPreview = arrowsForRender([], { from: "d2", to: "d4", color: "R" });
  assert.equal(withPreview.length, 1);
});

test("compactMarks returns undefined for empty marks", () => {
  assert.equal(compactMarks(emptyMarks()), undefined);
  const full = toggleSquareMark(emptyMarks(), "e4", "G");
  assert.equal(compactMarks(full), full);
});

test("marksFromPgnArrays parses color fields and arrows", () => {
  assert.equal(marksFromPgnArrays(), undefined);
  const marks = marksFromPgnArrays(["Ge4", "Yd5"], ["Re2e4"]);
  assert.deepEqual(
    marks?.squares.map((s) => s.square),
    ["e4", "d5"],
  );
  assert.deepEqual(marks?.arrows, [{ color: "R", from: "e2", to: "e4" }]);
  assert.equal(marksFromPgnArrays(["zzz"]), undefined);
});

test("mergeMarks combines parts and compacts empties", () => {
  const a = toggleSquareMark(emptyMarks(), "e4", "G");
  const b = toggleArrowMark(emptyMarks(), "e2", "e4", "R");
  const merged = mergeMarks(a, b, undefined);
  assert.equal(merged?.squares.length, 1);
  assert.equal(merged?.arrows.length, 1);
  assert.equal(mergeMarks(undefined, undefined), undefined);
  assert.equal(mergeMarks(emptyMarks()), undefined);
});

test("stripMarkTokens removes csl/cal tokens and trims", () => {
  assert.equal(stripMarkTokens("hello [%csl Ge4] world"), "hello world");
  assert.equal(stripMarkTokens("go [%cal Re2e4]"), "go");
  assert.equal(stripMarkTokens("plain"), "plain");
});

test("parseMarksFromComment splits text and marks", () => {
  assert.deepEqual(parseMarksFromComment(undefined), {});
  assert.deepEqual(parseMarksFromComment(""), {});
  const { text, marks } = parseMarksFromComment("nice [%csl Ge4] [%cal Re2e4]");
  assert.equal(text, "nice");
  assert.deepEqual(
    marks?.squares.map((s) => s.square),
    ["e4"],
  );
  assert.equal(marks?.arrows.length, 1);
  // comment with only marks has no text
  const onlyMarks = parseMarksFromComment("[%csl Ge4]");
  assert.equal(onlyMarks.text, undefined);
  assert.ok(onlyMarks.marks);
});

test("formatMarksPgn serializes squares and arrows", () => {
  assert.equal(formatMarksPgn(undefined), "");
  assert.equal(formatMarksPgn(emptyMarks()), "");
  assert.equal(
    formatMarksPgn(toggleSquareMark(emptyMarks(), "e4", "G")),
    "[%csl Ge4]",
  );
  assert.equal(
    formatMarksPgn(toggleArrowMark(emptyMarks(), "e2", "e4", "R")),
    "[%cal Re2e4]",
  );
});

test("formatCommentWithMarks joins marks and cleaned text", () => {
  const marks = toggleSquareMark(emptyMarks(), "e4", "G");
  assert.equal(formatCommentWithMarks("hello", marks), "[%csl Ge4] hello");
  assert.equal(formatCommentWithMarks(undefined, marks), "[%csl Ge4]");
  assert.equal(formatCommentWithMarks("hello", undefined), "hello");
  assert.equal(formatCommentWithMarks(undefined, undefined), undefined);
  // stale inline tokens are stripped before joining
  assert.equal(
    formatCommentWithMarks("old [%csl Yd5] text", marks),
    "[%csl Ge4] old text",
  );
});
