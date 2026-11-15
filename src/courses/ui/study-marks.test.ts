import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MARK_FILL, MARK_HEX } from "../../chess/marks.ts";
import { mergeStudyArrows, mergeStudySquareStyles } from "./study-marks.ts";

const marks = {
  squares: [{ color: "G" as const, square: "e4" }],
  arrows: [
    { color: "R" as const, from: "e2", to: "e4" },
    { color: "Y" as const, from: "g1", to: "f3" },
  ],
};

describe("study marks merging", () => {
  it("draws the hint arrow last and drops a duplicate author arrow", () => {
    const hint = { startSquare: "e2", endSquare: "e4", color: MARK_HEX.B };
    const out = mergeStudyArrows(marks, [hint]);
    assert.deepEqual(
      out.map((a) => a.startSquare + a.endSquare),
      ["g1f3", "e2e4"],
    );
    assert.equal(out[1], hint);
  });
  it("without marks leaves arrows and styles untouched", () => {
    const hint = [{ startSquare: "a1", endSquare: "a2", color: "x" }];
    assert.deepEqual(mergeStudyArrows(undefined, hint), hint);
    const styles = { e4: { boxShadow: "s" } };
    assert.equal(mergeStudySquareStyles(undefined, styles), styles);
  });
  it("lets last-move/selection styles win over the author fill", () => {
    const out = mergeStudySquareStyles(marks, { e4: { backgroundColor: "last" }, d4: { boxShadow: "s" } });
    assert.equal(out.e4?.backgroundColor, "last");
    const only = mergeStudySquareStyles(marks, { e4: { boxShadow: "ring" } });
    assert.deepEqual(only.e4, { backgroundColor: MARK_FILL.G, boxShadow: "ring" });
  });
});
