import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHeatmap,
  heatBucket,
  heatmapWeeksForWidth,
  HEAT_BUCKET_MIN,
  visibleMonthLabels,
} from "./heatmap";
import type { DayActivity } from "./types";

const d = (solved: number, failed = 0, ms = 60_000): DayActivity => ({ solved, failed, ms, xp: 0 });

test("heatBucket maps puzzles per day to 5 buckets", () => {
  assert.deepEqual(HEAT_BUCKET_MIN, [1, 5, 10, 20]);
  const cases: [number, number][] = [[0, 0], [1, 1], [4, 1], [5, 2], [9, 2], [10, 3], [19, 3], [20, 4], [500, 4]];
  for (const [n, bucket] of cases) {
    assert.equal(heatBucket(n), bucket, `${n}`);
  }
});

// 2026-11-05 is a Thursday; week starts Sunday Nov 1.
test("buildHeatmap lays out Sunday-start weeks and hides future days", () => {
  const m = buildHeatmap({ "2026-11-05": d(7, 1, 120_000) }, "2026-11-05", 18);
  assert.equal(m.weeks.length, 18);
  const last = m.weeks[17];
  assert.equal(last[0]?.key, "2026-11-01");
  assert.equal(last[4]?.key, "2026-11-05");
  assert.equal(last[4]?.today, true);
  assert.equal(last[4]?.bucket, 2);
  assert.equal(last[5], null);
  assert.equal(last[6], null);
  assert.equal(m.weeks[0][0]?.key, "2026-07-05");
});

test("buildHeatmap totals, week count and frozen days", () => {
  const days = {
    "2026-11-01": d(3),
    "2026-11-03": d(2, 1, 180_000),
    "2026-10-01": d(30, 0, 600_000),
  };
  const m = buildHeatmap(days, "2026-11-03");
  assert.equal(m.rangeSolved, 35);
  assert.equal(m.rangeFailed, 1);
  assert.equal(m.rangeMinutes, 14);
  assert.equal(m.rangeActiveDays, 3);
  assert.equal(m.weekActiveDays, 2);
  assert.deepEqual(m.streak.frozenDays, ["2026-11-02"]);
  const cell = m.weeks[17][1];
  assert.equal(cell?.frozen, true);
  assert.equal(cell?.bucket, 0);
  assert.ok(m.months.length >= 4 && m.months[0].column === 0);
});

test("buildHeatmap flags an empty history", () => {
  assert.equal(buildHeatmap({}, "2026-11-05").hasActivity, false);
  assert.equal(buildHeatmap(undefined, "2026-11-05").hasActivity, false);
});

test("heatmapWeeksForWidth fits whole 15px columns, clamped to 12-52", () => {
  assert.equal(heatmapWeeksForWidth(0, 15), 18); // unmeasured: default
  assert.equal(heatmapWeeksForWidth(600, 15), 40);
  assert.equal(heatmapWeeksForWidth(270, 15), 18);
  assert.equal(heatmapWeeksForWidth(2000, 15), 52);
  assert.equal(heatmapWeeksForWidth(225, 15), 15);
  assert.equal(heatmapWeeksForWidth(212, 15), 14);
  assert.equal(heatmapWeeksForWidth(100, 15), 12);
});

test("visibleMonthLabels hides labels that overlap or run past the right edge", () => {
  const months = [
    { column: 0, month: 6 },
    { column: 2, month: 7 },
    { column: 6, month: 8 },
    { column: 10, month: 9 },
    { column: 15, month: 10 },
  ];
  // Jul is 2 columns from Aug (needs 3): hidden. Nov at 15 needs 15+3 <= 16: hidden.
  assert.deepEqual(
    visibleMonthLabels(months, 16).map((m) => m.month),
    [7, 8, 9],
  );
  // With 18 weeks Nov fits (15+3 <= 18).
  assert.deepEqual(
    visibleMonthLabels(months, 18).map((m) => m.month),
    [7, 8, 9, 10],
  );
  assert.deepEqual(visibleMonthLabels([], 12), []);
});

test("buildHeatmap honors a reduced week count", () => {
  const m = buildHeatmap({ "2026-11-03": d(2) }, "2026-11-03", 12);
  assert.equal(m.weeks.length, 12);
  assert.equal(m.weeks[0][0]?.key, "2026-08-16");
});
