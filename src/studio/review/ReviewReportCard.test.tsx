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

const { KeyMomentsList, ReportDetails, ReportSummary, classificationChips } = await import("./ReviewReportCard.tsx");

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

// SIG-1208: one-line key-moment rows with the explanation inline under the active one.
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const momentRows = [
  { path: [0, 0, 0], san: "Nf3", side: "w" as const, label: "blunder" as const, index: 2, lossCp: 320, beforePawns: 0.3, afterPawns: -2.9, bestSan: "Nd5" },
  { path: [0, 0, 0, 0], san: "e5", side: "b" as const, label: "best" as const, index: 3, lossCp: 0, beforePawns: -2.9, afterPawns: -2.9, bestSan: null },
];

function renderMoments(selectedPath: number[] | null, onSelectMoment: (path: number[]) => void = () => {}) {
  return render(
    <KeyMomentsList
      moments={momentRows}
      moveNotation="english"
      locale="en"
      onSelectMoment={onSelectMoment}
      selectedPath={selectedPath}
      startFen={START_FEN}
      explanation={<p>because reasons</p>}
    />,
  );
}

test("key moment rows show number, move, evals and the best move only when it differs", () => {
  const { container } = renderMoments(null);
  const rows = container.querySelectorAll("li > button");
  assert.match(rows[0].textContent ?? "", /2\.Nf3\+0\.3 → -2\.9best: Nd5/);
  assert.doesNotMatch(rows[1].textContent ?? "", /best:/);
  assert.match(rows[1].textContent ?? "", /2\.\.\.e5/);
  assert.match(rows[0].getAttribute("aria-label") ?? "", /Blunder/);
});

test("the explanation renders only under the active row, outside the export", () => {
  const { container } = renderMoments([0, 0, 0]);
  const items = container.querySelectorAll("li");
  const region = items[0].querySelector("[data-export-ignore]");
  assert.ok(region);
  assert.equal(region.textContent, "because reasons");
  assert.equal(items[1].querySelector("[data-export-ignore]"), null);
});

test("clicking the active row collapses its explanation; another row navigates", () => {
  const selected: number[][] = [];
  const { container } = renderMoments([0, 0, 0], (path) => selected.push(path));
  const rows = container.querySelectorAll("li > button");
  fireEvent.click(rows[0]);
  assert.equal(container.querySelector("[data-export-ignore]"), null);
  assert.equal(rows[0].getAttribute("aria-expanded"), "false");
  fireEvent.click(rows[0]);
  assert.ok(container.querySelector("[data-export-ignore]"));
  assert.deepEqual(selected, []);
  fireEvent.click(rows[1]);
  assert.deepEqual(selected, [[0, 0, 0, 0]]);
});

test("SIG-1207: summary renders the verdict row and one accuracy bar per side with a value", () => {
  const verdict = "Ana 82.4%, Bruno 82.4%. Clean game: no mistakes or blunders.";
  render(<ReportSummary report={report} locale="en" verdict={verdict} />);
  assert.ok(screen.getByText(verdict));
  const bars = document.querySelectorAll("[data-accuracy-bar] > div");
  assert.equal(bars.length, 2);
  assert.equal((bars[0] as HTMLElement).style.width, "82.4%");
  cleanup();
  render(<ReportSummary report={report} locale="en" verdict={null} />);
  assert.equal(document.querySelector("[data-verdict]"), null);
});
