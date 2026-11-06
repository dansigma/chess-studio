import assert from "node:assert/strict";
import test from "node:test";
import { buildHeatmap, heatBucket, HEAT_BUCKET_MIN } from "./heatmap";
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
