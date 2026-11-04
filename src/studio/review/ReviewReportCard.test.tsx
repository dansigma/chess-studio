// SIG-1205: compact classification chips + collapsed Details disclosure.
import assert from "node:assert/strict";
import { after, before, afterEach, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { REVIEW_LABELS } from "@/src/chess/review";
import type { ReviewReport, SideReport } from "@/src/chess/review-report";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { ReportDetails, ReportSummary, classificationChips } = await import("./ReviewReportCard.tsx");

function side(name: string, counts: Partial<Record<(typeof REVIEW_LABELS)[number], number>>, phases?: Partial<SideReport["phases"]>): SideReport {
  const full = Object.fromEntries(REVIEW_LABELS.map((label) => [label, counts[label] ?? 0])) as SideReport["counts"];
  return {
    name,
    rating: 1500,
    accuracy: 82.4,
    acpl: 31,
    counts: full,
    forced: 2,
    phases: { opening: 90, middlegame: 70, endgame: null, ...phases },
    gameRating: { value: 1600, anchored: true },
  } as SideReport;
}

const report = {
  white: side("Ana", { best: 4, blunder: 1, brilliant: 1 }),
  black: side("Bruno", {}),
} as unknown as ReviewReport;

test("classificationChips lists only non-zero labels in REVIEW_LABELS order", () => {
  assert.deepEqual(classificationChips(report.white), [
    { label: "brilliant", count: 1 },
    { label: "best", count: 4 },
    { label: "blunder", count: 1 },
  ]);
  assert.deepEqual(classificationChips(report.black), []);
});

test("summary shows chips with count and tier name, and nothing for a side without labels", () => {
  render(<ReportSummary report={report} locale="en" openingName="C60 · Ruy Lopez" />);
  const chips = document.querySelectorAll("[data-chip]");
  assert.deepEqual(
    Array.from(chips).map((node) => node.getAttribute("data-chip")),
    ["brilliant", "best", "blunder"],
  );
  assert.match(chips[1].textContent ?? "", /4\s*Perfect/);
  assert.ok(screen.getByText("C60 · Ruy Lopez"));
  // Avg. loss and the full table live in Details only.
  assert.equal(screen.queryByText("Avg. loss"), null);
});

test("details are collapsed by default, expand with aria-expanded, and hide unreached phases", () => {
  render(<ReportDetails report={report} locale="en" />);
  const toggle = screen.getByRole("button", { name: "Details" });
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(screen.queryByRole("table"), null);
  fireEvent.click(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  const table = screen.getByRole("table");
  assert.ok(within(table).getByText("Avg. loss"));
  assert.ok(within(table).getByText("Opening"));
  assert.equal(within(table).queryByText("Endgame"), null, "phase not reached by either side is hidden");
  assert.ok(within(table).getByText("Forced"));
  assert.ok(within(table).getByText("Blunder"));
});
