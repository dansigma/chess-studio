// SIG-967: unit tests for review eval-chart math + filters, and evalSeries.
import assert from "node:assert/strict";
import test from "node:test";
import { evalSeries } from "@/src/chess/review-report.ts";
import {
  REVIEW_CHART_CAP,
  clampReviewPawns,
  filterKeyMoments,
  phaseSeparators,
  prevNextIndices,
  xAt,
  yAt,
} from "./review-chart.ts";
import type { KeyMomentRow } from "./ReviewReportCard.tsx";

function moment(
  san: string,
  side: "w" | "b",
  label: KeyMomentRow["label"],
  path: number[] = [0],
): KeyMomentRow {
  return { path, san, side, label };
}

test("evalSeries chains beforePawns then afterPawns, index = ply", () => {
  assert.deepEqual(evalSeries([]), []);
  assert.deepEqual(evalSeries([{ beforePawns: 0.2, afterPawns: 0.5 }]), [0.2, 0.5]);
  assert.deepEqual(
    evalSeries([
      { beforePawns: 0.2, afterPawns: 0.5 },
      { beforePawns: 0.5, afterPawns: -1.2 },
      { beforePawns: -1.2, afterPawns: -1.0 },
    ]),
    [0.2, 0.5, -1.2, -1.0],
  );
});

test("evalSeries passes mate/huge values through unclamped", () => {
  // MATE_PAWNS = 900 stays a grading-side mate marker; clamping is display-only.
  assert.deepEqual(evalSeries([{ beforePawns: 0, afterPawns: 900 }]), [0, 900]);
  assert.deepEqual(evalSeries([{ beforePawns: -900, afterPawns: 42 }]), [-900, 42]);
});

test("clampReviewPawns caps at ±5", () => {
  assert.equal(clampReviewPawns(0), 0);
  assert.equal(clampReviewPawns(5), 5);
  assert.equal(clampReviewPawns(-5), -5);
  assert.equal(clampReviewPawns(900), REVIEW_CHART_CAP);
  assert.equal(clampReviewPawns(-900), -REVIEW_CHART_CAP);
  assert.equal(REVIEW_CHART_CAP, 5);
});

test("yAt maps +cap to the top rail, -cap to the bottom, 0 to mid", () => {
  const height = 160;
  const pad = 16;
  assert.equal(yAt(5, height), pad);
  assert.equal(yAt(-5, height), height - pad);
  assert.equal(yAt(0, height), height / 2);
  // Mate spikes pin to the rails instead of overflowing.
  assert.equal(yAt(900, height), pad);
  assert.equal(yAt(-900, height), height - pad);
});

test("xAt centers a single point and spaces the rest evenly", () => {
  assert.equal(xAt(0, 1, 200), 100);
  assert.equal(xAt(0, 0, 200), 100);
  assert.equal(xAt(0, 3, 200), 28);
  assert.equal(xAt(2, 3, 200), 172);
  assert.equal(xAt(1, 3, 200), 100);
});

test("phaseSeparators reports ply indexes where the phase changes", () => {
  assert.deepEqual(phaseSeparators([]), []);
  assert.deepEqual(phaseSeparators([{ phase: "opening" }]), []);
  assert.deepEqual(
    phaseSeparators([{ phase: "opening" }, { phase: "opening" }, { phase: "opening" }]),
    [],
  );
  assert.deepEqual(
    phaseSeparators([
      { phase: "opening" },
      { phase: "opening" },
      { phase: "middlegame" },
      { phase: "middlegame" },
      { phase: "endgame" },
    ]),
    [2, 4],
  );
});

test("filterKeyMoments narrows by side then tier group", () => {
  const moments = [
    moment("Nxf7+", "w", "brilliant", [0, 0]),
    moment("Qh5", "b", "blunder", [0, 1]),
    moment("Re1", "w", "miss", [0, 2]),
    moment("d5", "b", "mistake", [0, 3]),
    moment("Nf3", "w", "inaccuracy", [0, 4]),
  ];
  assert.deepEqual(
    filterKeyMoments(moments, { side: "both", tierGroup: "all" }).map((row) => row.san),
    ["Nxf7+", "Qh5", "Re1", "d5", "Nf3"],
  );
  assert.deepEqual(
    filterKeyMoments(moments, { side: "w", tierGroup: "all" }).map((row) => row.san),
    ["Nxf7+", "Re1", "Nf3"],
  );
  assert.deepEqual(
    filterKeyMoments(moments, { side: "both", tierGroup: "brilliant" }).map((row) => row.san),
    ["Nxf7+"],
  );
  assert.deepEqual(
    filterKeyMoments(moments, { side: "both", tierGroup: "mistakes" }).map((row) => row.san),
    ["d5", "Nf3"],
  );
  assert.deepEqual(
    filterKeyMoments(moments, { side: "both", tierGroup: "misses" }).map((row) => row.san),
    ["Re1"],
  );
  assert.deepEqual(
    filterKeyMoments(moments, { side: "both", tierGroup: "blunders" }).map((row) => row.san),
    ["Qh5"],
  );
  // Side and group combine.
  assert.deepEqual(filterKeyMoments(moments, { side: "b", tierGroup: "brilliant" }), []);
});

test("filterKeyMoments never passes forced/book/null labels", () => {
  const moments = [
    moment("e4", "w", "book"),
    moment("Kf8", "w", "forced"),
    moment("a3", "w", null),
    moment("Qh5", "b", "blunder"),
  ];
  assert.deepEqual(
    filterKeyMoments(moments, { side: "both", tierGroup: "all" }).map((row) => row.san),
    ["Qh5"],
  );
});

test("prevNextIndices clamps at the ends with no wrap", () => {
  assert.deepEqual(prevNextIndices(0, null), { prev: null, next: null });
  assert.deepEqual(prevNextIndices(3, null), { prev: null, next: null });
  assert.deepEqual(prevNextIndices(3, 0), { prev: null, next: 1 });
  assert.deepEqual(prevNextIndices(3, 1), { prev: 0, next: 2 });
  assert.deepEqual(prevNextIndices(3, 2), { prev: 1, next: null });
  assert.deepEqual(prevNextIndices(1, 0), { prev: null, next: null });
});
