import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMoveSuffix,
  formatPgnNagTokens,
  formatPositionGlyphs,
  NAG_GLYPHS,
  nagGlyph,
  parseNags,
  toggleNag,
} from "./nags.ts";

test("parseNags accepts $-prefixed and bare numbers, dedupes, rejects garbage", () => {
  assert.deepEqual(parseNags(["$1", "3", "$1"]), [1, 3]);
  assert.deepEqual(parseNags(["  $6  "]), [6]);
  assert.equal(parseNags(["foo", "$", "$0", "-2", "1.5"]), undefined);
  assert.equal(parseNags([]), undefined);
  assert.equal(parseNags(null), undefined);
  assert.equal(parseNags(undefined), undefined);
});

test("parseNags returns undefined when nothing valid remains", () => {
  assert.equal(parseNags(["???"]), undefined);
});

test("toggleNag adds and removes a NAG, emptying to undefined", () => {
  assert.deepEqual(toggleNag(undefined, 1), [1]);
  assert.equal(toggleNag([1], 1), undefined);
  // 10 ("=") is a position NAG so it coexists with move NAG 1
  assert.deepEqual(toggleNag([1], 10), [1, 10]);
});

test("toggleNag keeps move NAGs exclusive", () => {
  // "!" (1) replaced by "?" (2)
  assert.deepEqual(toggleNag([1], 2), [2]);
  // toggling off the only move NAG empties the list
  assert.equal(toggleNag([1], 1), undefined);
});

test("toggleNag keeps position NAGs exclusive but preserves other groups", () => {
  // "=" (10) replaced by unclear (13)
  assert.deepEqual(toggleNag([10], 13), [13]);
  // position toggle keeps an unrelated "other" NAG
  assert.deepEqual(toggleNag([10, 22], 13), [13, 22]);
});

test("toggleNag sorts the result", () => {
  // "other"-group NAGs are not mutually exclusive, so both survive sorted
  assert.deepEqual(toggleNag([36], 22), [22, 36]);
});

test("formatMoveSuffix shows the first move-NAG glyph only", () => {
  assert.equal(formatMoveSuffix([1]), "!");
  assert.equal(formatMoveSuffix([3]), "!!");
  assert.equal(formatMoveSuffix([10]), "");
  assert.equal(formatMoveSuffix([10, 2]), "?");
  assert.equal(formatMoveSuffix(undefined), "");
});

test("formatPositionGlyphs shows non-move glyphs with $n fallback", () => {
  assert.equal(formatPositionGlyphs([10]), "=");
  assert.equal(formatPositionGlyphs([1]), "");
  assert.equal(formatPositionGlyphs([10, 13]), "= ∞");
  assert.equal(formatPositionGlyphs([999]), "$999");
  assert.equal(formatPositionGlyphs(undefined), "");
});

test("formatPgnNagTokens joins $-tokens", () => {
  assert.equal(formatPgnNagTokens([1, 3]), "$1 $3");
  assert.equal(formatPgnNagTokens(undefined), "");
  assert.equal(formatPgnNagTokens([]), "");
});

test("nagGlyph looks up known NAGs", () => {
  assert.equal(nagGlyph(1)?.glyph, "!");
  assert.equal(nagGlyph(999), undefined);
});

test("catalog rows are unique with non-empty glyph and label", () => {
  const seen = new Set<number>();
  for (const row of NAG_GLYPHS) {
    assert.ok(!seen.has(row.nag), `duplicate NAG $${row.nag}`);
    seen.add(row.nag);
    assert.ok(row.glyph.length > 0, `NAG $${row.nag} needs a glyph`);
    assert.ok(row.label.length > 0, `NAG $${row.nag} needs a label`);
  }
});

test("spec numbers resolve to the corrected catalog rows", () => {
  // Phase-0 ground truth: 132 is moderate counterplay, 140 is with-the-idea.
  assert.equal(nagGlyph(132)?.label, "With counterplay");
  assert.equal(nagGlyph(140)?.label, "With the idea");
  assert.equal(nagGlyph(44)?.glyph, "⯹");
  assert.equal(nagGlyph(45)?.glyph, "⯹");
  assert.equal(nagGlyph(130)?.glyph, "⇆");
  assert.equal(nagGlyph(136)?.glyph, "⨁");
  assert.equal(nagGlyph(37)?.glyph, "↑");
  assert.equal(nagGlyph(41)?.glyph, "→");
});

test("new NAGs render glyphs instead of the $N fallback", () => {
  for (const nag of [37, 41, 44, 45, 130, 132, 136, 140, 146]) {
    assert.notEqual(formatPositionGlyphs([nag]), `$${nag}`);
  }
  assert.equal(formatPgnNagTokens([44, 140]), "$44 $140");
  assert.deepEqual(toggleNag([44], 140), [44, 140]);
});
