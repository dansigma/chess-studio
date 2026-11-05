import assert from "node:assert/strict";
import test from "node:test";
import type { ReviewLabel } from "./review.ts";
import {
  PACE_WEIGHTS,
  buildTimeReport,
  clockCoverage,
  parseTimeControl,
  timeSpentPerMove,
  type TimeRow,
  type TimedMove,
} from "./review-time.ts";

test("parseTimeControl: base, base+increment, first stage of FIDE forms", () => {
  assert.deepEqual(parseTimeControl("600"), { baseMs: 600_000, incrementMs: 0 });
  assert.deepEqual(parseTimeControl("180+2"), { baseMs: 180_000, incrementMs: 2000 });
  assert.deepEqual(parseTimeControl(" 60+0 "), { baseMs: 60_000, incrementMs: 0 });
  assert.deepEqual(parseTimeControl("40/5400+30:1800+30"), { baseMs: 5_400_000, incrementMs: 30_000 });
  assert.deepEqual(parseTimeControl("40/7200:3600"), { baseMs: 7_200_000, incrementMs: 0 });
});

test("parseTimeControl: -, ?, missing, daily and garbage mean no clocks", () => {
  for (const value of ["-", "?", "", "  ", undefined, null, "1/86400", "1/259200", "abc", "0", "+2", "180+"]) {
    assert.equal(parseTimeControl(value), null, `${String(value)} -> no clocks`);
  }
});

// Lichess-style 180+2 with tenths. Clock values are the time left AFTER the move.
// White spent 4.0, 2.7, 3.3, 28.0, 0.1, 13.4 s; Black spent 2.8, 1.8, 11.4, 0.1, 13.9, 62.0 s.
const W = [178_000, 177_300, 176_000, 150_000, 151_900, 140_500];
const B = [179_200, 179_400, 170_000, 171_900, 160_000, 100_000];
const LABELS_W: ReviewLabel[] = ["book", "book", "best", "blunder", "veryGood", "mistake"];
const LABELS_B: ReviewLabel[] = ["book", "decent", "inaccuracy", "forced", "miss", "great"];

function interleaved(
  white: number[],
  black: number[],
  labelsW: ReviewLabel[],
  labelsB: ReviewLabel[],
  extra: (side: "w" | "b", i: number) => Partial<TimeRow> = () => ({}),
): TimeRow[] {
  const rows: TimeRow[] = [];
  for (let i = 0; i < white.length; i += 1) {
    rows.push({ side: "w", phase: i < 2 ? "opening" : i < 5 ? "middlegame" : "endgame", label: labelsW[i], afterPawns: 0, clockMs: white[i], ...extra("w", i) });
    rows.push({ side: "b", phase: i < 3 ? "opening" : i < 5 ? "middlegame" : "endgame", label: labelsB[i], afterPawns: 0, clockMs: black[i], ...extra("b", i) });
  }
  return rows;
}

test("timeSpentPerMove: first move uses the starting time, increment is added back", () => {
  const moves: TimedMove[] = interleaved(W, B, LABELS_W, LABELS_B);
  const spent = timeSpentPerMove(moves, { baseMs: 180_000, incrementMs: 2000 });
  const white = spent.filter((_, i) => i % 2 === 0);
  const black = spent.filter((_, i) => i % 2 === 1);
  assert.deepEqual(white, [4000, 2700, 3300, 28_000, 100, 13_400]);
  assert.deepEqual(black, [2800, 1800, 11_400, 100, 13_900, 62_000]);
});

test("timeSpentPerMove: no increment, and negative results clamp to 0", () => {
  const moves: TimedMove[] = [
    { side: "w", clockMs: 598_000 },
    { side: "b", clockMs: 599_000 },
    { side: "w", clockMs: 590_000 },
    { side: "b", clockMs: 599_500 }, // clock went UP without an increment: clamp
  ];
  assert.deepEqual(timeSpentPerMove(moves, { baseMs: 600_000, incrementMs: 0 }), [2000, 1000, 8000, 0]);
});

test("timeSpentPerMove: a missing clock makes that move and the side's next one unknown", () => {
  const moves: TimedMove[] = [
    { side: "w", clockMs: 598_000 },
    { side: "b", clockMs: 599_000 },
    { side: "w" },
    { side: "b", clockMs: 595_000 },
    { side: "w", clockMs: 580_000 },
  ];
  assert.deepEqual(timeSpentPerMove(moves, { baseMs: 600_000, incrementMs: 0 }), [2000, 1000, null, 4000, null]);
});

test("clockCoverage", () => {
  assert.equal(clockCoverage([]), 0);
  assert.equal(clockCoverage([{ side: "w", clockMs: 1 }, { side: "b" }]), 0.5);
});

test("Lichess-style game with increment and tenths: every metric", () => {
  const rows = interleaved(W, B, LABELS_W, LABELS_B, (side, i) => (side === "b" && i === 3 ? { forced: true } : {}));
  const report = buildTimeReport(rows, "180+2");
  assert.ok(report);
  const { white, black } = report;
  assert.equal(white.timedMoves, 6);
  assert.equal(white.totalMs, 4000 + 2700 + 3300 + 28_000 + 100 + 13_400);
  // Accurate: best 3.3 s, veryGood 0.1 s. Inaccurate: blunder 28 s, mistake 13.4 s. Book left out.
  assert.equal(white.avgAccurateMs, 1700);
  assert.equal(white.accurateMoves, 2);
  assert.equal(white.avgInaccurateMs, 20_700);
  assert.equal(white.inaccurateMoves, 2);
  assert.deepEqual(white.longest, { index: 6, label: "blunder", ms: 28_000 });
  assert.equal(white.premoves, 1);
  // Black: decent 1.8 s and great 62 s are accurate; inaccuracy 11.4 s and miss 13.9 s are not; forced/book are in neither.
  assert.equal(black.avgAccurateMs, 31_900);
  assert.equal(black.avgInaccurateMs, 12_650);
  assert.deepEqual(black.longest, { index: 11, label: "great", ms: 62_000 });
  assert.equal(black.premoves, 1, "the forced 0.1 s move still counts as a premove");
  // spentMs is aligned with the rows.
  assert.equal(report.spentMs.length, rows.length);
  assert.equal(report.spentMs[6], 28_000);
});

test("phase share: each side's time per phase sums to 100", () => {
  const rows = interleaved(W, B, LABELS_W, LABELS_B);
  const report = buildTimeReport(rows, "180+2");
  assert.ok(report);
  const total = 4000 + 2700 + 3300 + 28_000 + 100 + 13_400;
  assert.ok(Math.abs((report.white.phaseShare.opening ?? 0) - ((4000 + 2700) / total) * 100) < 1e-9);
  assert.ok(Math.abs((report.white.phaseShare.middlegame ?? 0) - ((3300 + 28_000 + 100) / total) * 100) < 1e-9);
  assert.ok(Math.abs((report.white.phaseShare.endgame ?? 0) - (13_400 / total) * 100) < 1e-9);
  const sum = Object.values(report.black.phaseShare).reduce<number>((acc, value) => acc + (value ?? 0), 0);
  assert.ok(Math.abs(sum - 100) < 1e-9);
});

test("Chess.com-style game without increment (TimeControl 600)", () => {
  const rows: TimeRow[] = [
    { side: "w", phase: "opening", label: "best", afterPawns: 0, clockMs: 598_000 },
    { side: "b", phase: "opening", label: "best", afterPawns: 0, clockMs: 599_000 },
    { side: "w", phase: "opening", label: "decent", afterPawns: 0, clockMs: 590_000 },
    { side: "b", phase: "opening", label: "mistake", afterPawns: 0, clockMs: 595_500 },
    { side: "w", phase: "middlegame", label: "blunder", afterPawns: 0, clockMs: 589_900 },
    { side: "b", phase: "middlegame", label: "best", afterPawns: 0, clockMs: 595_500 },
  ];
  const report = buildTimeReport(rows, "600");
  assert.ok(report);
  assert.deepEqual(report.spentMs, [2000, 1000, 8000, 3500, 100, 0]);
  assert.equal(report.white.avgAccurateMs, 5000);
  assert.equal(report.white.avgInaccurateMs, 100);
  assert.equal(report.white.premoves, 1);
  assert.equal(report.black.premoves, 1, "0 ms counts");
  assert.equal(report.black.avgInaccurateMs, 3500);
  assert.equal(report.black.pace, null, "fewer than the minimum timed moves: no Pace");
});

test("no clocks: no TimeControl, daily, correspondence, or nothing parsed", () => {
  const rows = interleaved(W, B, LABELS_W, LABELS_B);
  assert.equal(buildTimeReport(rows, undefined), null, "clocks without a TimeControl are not guessed at");
  assert.equal(buildTimeReport(rows, "-"), null);
  assert.equal(buildTimeReport(rows, "1/86400"), null);
  const bare = rows.map((row) => ({ ...row, clockMs: undefined }));
  assert.equal(buildTimeReport(bare, "180+2"), null);
  assert.equal(buildTimeReport([], "180+2"), null);
});

test("partial clocks: computed from 90% coverage, skipped below", () => {
  // 20 moves with the clock of ply 5 missing = 95%.
  const white = Array.from({ length: 10 }, (_, i) => 599_000 - i * 5000);
  const black = Array.from({ length: 10 }, (_, i) => 599_500 - i * 4000);
  const labels = Array<ReviewLabel>(10).fill("best");
  const full = interleaved(white, black, labels, labels);
  const missing = full.map((row, i) => (i === 5 ? { ...row, clockMs: undefined } : row));
  const report = buildTimeReport(missing, "600");
  assert.ok(report);
  assert.equal(report.spentMs[5], null);
  assert.equal(report.spentMs[7], null, "the side's next move has no usable previous clock");
  assert.equal(report.black.timedMoves, 8);
  assert.equal(report.white.timedMoves, 10);
  // 2 more missing: 17/20 = 85%.
  const worse = missing.map((row, i) => (i === 12 || i === 14 ? { ...row, clockMs: undefined } : row));
  assert.ok(clockCoverage(worse) < 0.9);
  assert.equal(buildTimeReport(worse, "600"), null);
});

// ---- Pace -------------------------------------------------------------------

/** Rows for one side only needing times: `spent` per move, no increment, base 600 s. */
function paceRows(spent: number[], patch: (i: number) => Partial<TimeRow> = () => ({})): TimeRow[] {
  let clock = 600_000;
  return spent.flatMap((ms, i) => {
    clock -= ms;
    return [
      { side: "w" as const, phase: "middlegame" as const, label: "best" as ReviewLabel, afterPawns: 0, weight: 1, clockMs: clock, ...patch(i) },
      { side: "b" as const, phase: "middlegame" as const, label: "best" as ReviewLabel, afterPawns: 0, weight: 1, clockMs: 600_000 - (i + 1) * 1000 },
    ];
  });
}

test("Pace: steady play is 3 stars; too few moves is null", () => {
  assert.equal(buildTimeReport(paceRows([5000, 6000, 5000, 7000, 6000, 5000]), "600")?.white.pace, 3);
  assert.equal(buildTimeReport(paceRows([5000, 6000, 5000, 7000]), "600")?.white.pace, null);
});

test("Pace: time on book moves lowers it (full penalty at 25% of the clock)", () => {
  const rows = paceRows([20_000, 20_000, 5000, 5000, 5000, 5000], (i) => (i < 2 ? { label: "book" } : {}));
  const report = buildTimeReport(rows, "600");
  assert.ok(report);
  // 40 s of 80 s = 50% > 25%: full 0.75 penalty -> 2.25 -> rounds to 2.5.
  assert.equal(report.white.paceBreakdown?.bookPenalty, PACE_WEIGHTS.bookMaxPenalty);
  assert.equal(report.white.pace, 2.5);
});

test("Pace: fast moves in critical positions lower it", () => {
  // Average = 8.5 s, fast = under 4.25 s. Both critical moves (weight 8) took 1 s.
  const rows = paceRows([1000, 1000, 15_000, 15_000, 10_000, 9000], (i) => (i < 2 ? { weight: 8 } : {}));
  const report = buildTimeReport(rows, "600");
  assert.ok(report);
  assert.equal(report.white.paceBreakdown?.rushedPenalty, PACE_WEIGHTS.rushedMaxPenalty);
  assert.equal(report.white.pace, 1.5);
  // Same speed in calm positions (weight 1) is not penalised.
  assert.equal(buildTimeReport(paceRows([1000, 1000, 15_000, 15_000, 10_000, 9000]), "600")?.white.pace, 3);
  // A slow critical move is fine.
  assert.equal(buildTimeReport(paceRows([30_000, 1000, 15_000, 15_000, 10_000, 9000], (i) => (i === 0 ? { weight: 8 } : {})), "600")?.white.pace, 3);
});

test("Pace: ending a decisive game with almost no time left lowers it", () => {
  const spent = [5000, 5000, 5000, 5000, 5000, 570_000];
  // Last white clock = 600 - 595 = 5 s; limit = max(5 s, 3% of 600 s = 18 s) = 18 s.
  const decisive = paceRows(spent, (i) => (i === 5 ? { afterPawns: 6 } : {}));
  // The last row overall is Black's, so set the decisive eval on it.
  decisive[decisive.length - 1] = { ...decisive[decisive.length - 1], afterPawns: 6 };
  const report = buildTimeReport(decisive, "600");
  assert.ok(report);
  assert.equal(report.white.paceBreakdown?.lowTimePenalty, PACE_WEIGHTS.lowTimePenalty);
  assert.equal(report.white.pace, 2.5, "3 - 0.75 = 2.25 -> half-star rounding gives 2.5");
  // Not decisive: no penalty.
  const level = paceRows(spent);
  assert.equal(buildTimeReport(level, "600")?.white.paceBreakdown?.lowTimePenalty, 0);
  // Decisive mate score counts as decisive.
  const mate = paceRows(spent);
  mate[mate.length - 1] = { ...mate[mate.length - 1], afterPawns: -900 };
  assert.equal(buildTimeReport(mate, "600")?.white.paceBreakdown?.lowTimePenalty, PACE_WEIGHTS.lowTimePenalty);
});

test("Pace is clamped to 0..3 in half steps", () => {
  const rows = paceRows([20_000, 20_000, 1000, 1000, 1000, 560_000], (i) => (i < 2 ? { label: "book", weight: 8 } : i < 5 ? { weight: 8 } : { afterPawns: 9 }));
  rows[rows.length - 1] = { ...rows[rows.length - 1], afterPawns: 9 };
  const pace = buildTimeReport(rows, "600")?.white.pace;
  assert.ok(pace != null && pace >= 0 && pace <= 3 && pace * 2 === Math.round(pace * 2));
});

test("SIG-1225: unscored book rows (null afterPawns) do not break the time report", () => {
  const rows: TimeRow[] = [
    { side: "w", phase: "opening", label: "book", afterPawns: null, clockMs: 598_000 },
    { side: "b", phase: "opening", label: "book", afterPawns: null, clockMs: 599_000 },
    { side: "w", phase: "opening", label: "best", afterPawns: 0.2, clockMs: 590_000 },
  ];
  const report = buildTimeReport(rows, "600");
  assert.ok(report);
  assert.equal(report.spentMs.length, 3);
});
