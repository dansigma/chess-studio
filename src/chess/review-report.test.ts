import assert from "node:assert/strict";
import test from "node:test";
import {
  anchoredRating,
  averageCpLoss,
  buildReviewReport,
  eloFromAcpl,
  estimateGameRating,
  expectedAcpl,
  keyMoments,
  parseRating,
  type ReportRow,
} from "./review-report.ts";
import type { ReviewLabel } from "./review.ts";

function row(side: "w" | "b", lossCp: number, label: ReviewLabel | null = "veryGood", extra: Partial<ReportRow> = {}): ReportRow {
  return { side, label, lossCp, winLoss: 0, accuracy: 90, phase: "middlegame", ...extra };
}

function rowsFor(side: "w" | "b", count: number, lossCp: number): ReportRow[] {
  return Array.from({ length: count }, () => row(side, lossCp));
}

test("eloFromAcpl follows 3100·e^(−0.01·ACPL)", () => {
  assert.equal(eloFromAcpl(0), 3100);
  assert.ok(Math.abs(eloFromAcpl(100) - 3100 * Math.exp(-1)) < 1e-9);
});

test("expectedAcpl is zero at 3100 and grows as the rating drops", () => {
  assert.equal(expectedAcpl(3100), 0);
  assert.equal(expectedAcpl(4000), 0);
  assert.ok(Math.abs(expectedAcpl(1500) - -100 * Math.log(1500 / 3100)) < 1e-9);
});

test("anchoring keeps the rating when ACPL matches, lowers it when worse, raises it when better", () => {
  const expected = expectedAcpl(1500);
  assert.ok(Math.abs(anchoredRating(1500, expected) - 1500) < 1e-9);
  assert.ok(anchoredRating(1500, expected + 40) < 1500);
  assert.ok(anchoredRating(1500, expected - 40) > 1500);
  assert.ok(Math.abs(anchoredRating(1500, expected + 40) - 1500 * Math.exp(-0.2)) < 1e-9);
});

test("ACPL caps each loss at 1000 and ignores book and forced moves", () => {
  const rows = [
    row("w", 5000),
    row("w", 20),
    row("w", 900, "book"),
    row("w", 700, "veryGood", { forced: true }),
  ];
  assert.equal(averageCpLoss(rows), 510);
  assert.equal(averageCpLoss([row("w", 10, "book")]), null);
});

test("game rating is rounded to 10 and unanchored without a header rating", () => {
  const rating = estimateGameRating(rowsFor("w", 10, 30), null);
  assert.equal(rating.anchored, false);
  assert.equal(rating.value, Math.round(eloFromAcpl(30) / 10) * 10);
  assert.equal((rating.value ?? 1) % 10, 0);
});

test("game rating anchors to the header rating when present", () => {
  const acpl = expectedAcpl(1800) + 20;
  const rating = estimateGameRating(rowsFor("b", 12, acpl), 1800);
  assert.equal(rating.anchored, true);
  assert.equal(rating.value, Math.round(anchoredRating(1800, acpl) / 10) * 10);
  assert.ok((rating.value ?? 0) < 1800);
});

test("short games show no game rating", () => {
  assert.deepEqual(estimateGameRating(rowsFor("w", 7, 30), 1500), { value: null, anchored: false });
});

test("book and forced moves do not count toward the rating threshold", () => {
  const rows = [...rowsFor("w", 1, 30), ...Array.from({ length: 4 }, () => row("w", 0, "book")), ...Array.from({ length: 3 }, () => row("w", 0, "veryGood", { forced: true }))];
  assert.equal(rows.length, 8);
  assert.equal(estimateGameRating(rows, null).value, null);
});

test("the rating threshold applies per side inside a report", () => {
  const report = buildReviewReport([...rowsFor("w", 6, 20), ...rowsFor("b", 10, 20)], {});
  assert.equal(report.white.gameRating.value, null);
  assert.equal(typeof report.black.gameRating.value, "number");
});

test("forced moves are left out of accuracy", () => {
  const report = buildReviewReport([row("w", 0, "veryGood", { accuracy: 100 }), row("w", 0, "veryGood", { accuracy: 20, forced: true })], {});
  assert.equal(report.white.accuracy, 100);
});

test("parseRating ignores missing or placeholder values", () => {
  assert.equal(parseRating("1850"), 1850);
  assert.equal(parseRating("?"), null);
  assert.equal(parseRating("-"), null);
  assert.equal(parseRating("0"), null);
  assert.equal(parseRating(undefined), null);
});

test("the report builds the header, counts, accuracy and phases per side", () => {
  const rows: ReportRow[] = [
    ...rowsFor("w", 8, 10),
    ...rowsFor("b", 8, 10),
    row("w", 400, "blunder", { accuracy: 10, phase: "endgame" }),
    row("b", 0, "book", { accuracy: 100, phase: "opening" }),
  ];
  const report = buildReviewReport(rows, { White: "Ana", Black: "", WhiteElo: "1700", BlackElo: "?" });
  assert.equal(report.white.name, "Ana");
  assert.equal(report.black.name, "Black");
  assert.equal(report.white.rating, 1700);
  assert.equal(report.black.rating, null);
  assert.equal(report.white.counts.blunder, 1);
  assert.equal(report.black.counts.book, 1);
  assert.equal(report.white.counts.veryGood, 8);
  assert.equal(report.white.phases.endgame, 10);
  assert.equal(report.black.phases.opening, null);
  assert.equal(report.white.moves, 9);
  assert.equal(report.white.gameRating.anchored, true);
  assert.equal(report.black.gameRating.anchored, false);
  assert.ok((report.white.accuracy ?? 100) < (report.black.accuracy ?? 0));
});

test("key moments include miss and skip ordinary tiers", () => {
  const rows = [row("w", 0, "best"), row("b", 300, "miss"), row("w", 500, "blunder"), row("b", 0, "decent"), row("w", 0, null)];
  assert.deepEqual(
    keyMoments(rows).map((moment) => moment.label),
    ["miss", "blunder"],
  );
});
