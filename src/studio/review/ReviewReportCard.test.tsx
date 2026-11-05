// SIG-1205: compact classification chips + collapsed Details disclosure. SIG-1219: report card redesign.
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

test("SIG-1219: the classification table is always visible, one row per tier, with zero counts faint", () => {
  render(<ReportSummary report={report} locale="en" openingName="C60 · Ruy Lopez" />);
  const table = document.querySelector("[data-classification=table]") as HTMLElement;
  assert.ok(table);
  const rows = Array.from(table.querySelectorAll("[data-tier-row]"));
  assert.deepEqual(
    rows.map((row) => row.getAttribute("data-tier-row")),
    [...REVIEW_LABELS],
  );
  // One badge per tier row, each with its own mark.
  assert.equal(table.querySelectorAll("[data-tier-badge]").length, REVIEW_LABELS.length);
  const perfect = within(table.querySelector("[data-tier-row=best]") as HTMLElement);
  assert.ok(perfect.getByText("Perfect"));
  assert.equal(perfect.getByText("4").className.includes("text-studio-faint"), false);
  // Zero counts (both sides) are faint, including the name.
  const mistake = table.querySelector("[data-tier-row=mistake]") as HTMLElement;
  assert.ok(within(mistake).getByText("Mistake").className.includes("text-studio-faint"));
  for (const zero of Array.from(mistake.querySelectorAll("td span"))) {
    assert.ok(zero.className.includes("text-studio-faint"), "zero count is faint");
  }
  // Zero counts are not buttons; no chips in the wide layout.
  assert.equal(mistake.querySelectorAll("button").length, 0);
  assert.equal(document.querySelector("[data-chip]"), null);
  assert.ok(screen.getByText("C60 · Ruy Lopez"));
});

test("SIG-1219: counts become buttons only with a handler and a non-zero count", () => {
  render(<ReportSummary report={report} locale="en" />);
  assert.equal(document.querySelectorAll("[data-classification=table] button").length, 0, "no handler: plain numbers");
  cleanup();
  render(<ReportSummary report={report} locale="en" onSelectTier={() => {}} />);
  const buttons = Array.from(document.querySelectorAll("[data-classification=table] button"));
  assert.deepEqual(
    buttons.map((button) => button.getAttribute("data-tier-count")),
    ["brilliant", "best", "blunder"],
    "Ana's non-zero counts only; Bruno has none",
  );
  assert.equal(buttons[2].getAttribute("aria-label"), "Blunder by Ana: 1, go to next");
});

test("SIG-1219: clicking a count reports the side and tier to jump to", () => {
  const calls: Array<[string, string]> = [];
  render(<ReportSummary report={report} locale="en" onSelectTier={(side, label) => calls.push([side, label])} />);
  fireEvent.click(screen.getByRole("button", { name: "Perfect by Ana: 4, go to next" }));
  fireEvent.click(screen.getByRole("button", { name: "Genius by Ana: 1, go to next" }));
  assert.deepEqual(calls, [
    ["w", "best"],
    ["w", "brilliant"],
  ]);
});

test("SIG-1219: pt-br count buttons use the localized name", () => {
  render(<ReportSummary report={report} locale="pt-br" onSelectTier={() => {}} />);
  assert.ok(screen.getByRole("button", { name: "Capivarada de Ana: 1, ir para o próximo" }));
});

test("SIG-1219: compact layout falls back to chips with count and tier name, nothing for a side without labels", () => {
  render(<ReportSummary report={report} locale="en" openingName="C60 · Ruy Lopez" compact onSelectTier={() => {}} />);
  assert.equal(document.querySelector("[data-classification=table]"), null);
  const chips = document.querySelectorAll("[data-chip]");
  assert.deepEqual(
    Array.from(chips).map((node) => node.getAttribute("data-chip")),
    ["brilliant", "best", "blunder"],
  );
  assert.match(chips[1].textContent ?? "", /4\s*Perfect/);
  assert.ok(chips[1].querySelector("[data-tier-badge=best]"));
  // The chip counts still jump.
  assert.ok(chips[1].querySelector("button[data-tier-count=best]"));
  assert.equal(chips.length, 3, "Bruno has no labels: no chips for him");
  // Phases stay in the compact layout; avg. loss stays out of the card.
  assert.ok(document.querySelector("[data-report-section=phases]"));
  assert.equal(screen.queryByText("Avg. loss"), null);
});

test("SIG-1219: compact layout with no labels at all renders no classification block", () => {
  const empty = { white: side("Ana", {}), black: side("Bruno", {}) } as unknown as ReviewReport;
  render(<ReportSummary report={empty} locale="en" compact />);
  assert.equal(document.querySelector("[data-classification]"), null);
});

test("SIG-1219: header shows initials avatars, large accuracy and the game rating note", () => {
  const rated = {
    white: { ...side("Ana Souza", {}), gameRating: { value: 1600, anchored: false } },
    black: side("Bruno", {}),
  } as unknown as ReviewReport;
  render(<ReportSummary report={rated} locale="en" />);
  const avatars = document.querySelectorAll("[data-avatar]");
  assert.deepEqual(
    Array.from(avatars).map((node) => node.textContent),
    ["AS", "B"],
  );
  assert.equal(screen.getAllByText("82.4").length, 2);
  assert.ok(screen.getByText(/^≈\s*1[.,]?600$/));
  const toggle = screen.getByRole("button", { name: /Game rating/ });
  assert.equal(screen.queryByRole("note"), null);
  fireEvent.click(toggle);
  assert.ok(screen.getByRole("note"));
});

test("SIG-1219: phase bars cover one, two or three phases and skip phases nobody reached", () => {
  const cases: Array<[Partial<SideReport["phases"]>, Partial<SideReport["phases"]>, string[]]> = [
    [{ opening: 88, middlegame: null, endgame: null }, { opening: 70, middlegame: null, endgame: null }, ["opening"]],
    [{ opening: 90, middlegame: 70, endgame: null }, { opening: 80, middlegame: 60, endgame: null }, ["opening", "middlegame"]],
    [{ opening: 90, middlegame: 70, endgame: 55 }, { opening: 80, middlegame: 60, endgame: 40 }, ["opening", "middlegame", "endgame"]],
    // One side never reached the endgame: the phase stays, with a dash for that side.
    [{ opening: 90, middlegame: 70, endgame: 55 }, { opening: 80, middlegame: 60, endgame: null }, ["opening", "middlegame", "endgame"]],
  ];
  for (const [whitePhases, blackPhases, expected] of cases) {
    const phased = {
      white: side("Ana", {}, whitePhases),
      black: side("Bruno", {}, blackPhases),
    } as unknown as ReviewReport;
    const { unmount } = render(<ReportSummary report={phased} locale="en" />);
    const rows = Array.from(document.querySelectorAll("[data-phase]"));
    assert.deepEqual(
      rows.map((row) => row.getAttribute("data-phase")),
      expected,
    );
    unmount();
  }
});

test("SIG-1219: phase bars print the value and size the bar 0-100", () => {
  render(<ReportSummary report={report} locale="en" />);
  const opening = document.querySelector("[data-phase=opening]") as HTMLElement;
  assert.equal(within(opening).getAllByText("90.0").length, 2);
  const bars = opening.querySelectorAll("[data-phase-bar] > div");
  assert.equal((bars[0] as HTMLElement).style.width, "90%");
  assert.equal((bars[1] as HTMLElement).style.width, "90%");
  // Endgame was reached by nobody in the fixture: left out.
  assert.equal(document.querySelector("[data-phase=endgame]"), null);
});

test("SIG-1219: the Time slot renders nothing yet", () => {
  render(<ReportSummary report={report} locale="en" />);
  assert.equal(document.querySelector("[data-report-section=time]"), null);
  assert.equal(screen.queryByText(/time/i), null);
});

test("SIG-1219: details are collapsed by default and hold only avg. loss and Forced", () => {
  render(<ReportDetails report={report} locale="en" />);
  const toggle = screen.getByRole("button", { name: "Details" });
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(screen.queryByRole("table"), null);
  fireEvent.click(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  const table = screen.getByRole("table");
  assert.ok(within(table).getByText("Avg. loss"));
  assert.ok(within(table).getByText("Forced"));
  assert.equal(within(table).queryByText("Opening"), null, "phases moved into the card");
  assert.equal(within(table).queryByText("Blunder"), null, "tiers moved into the card");
  assert.equal(table.querySelectorAll("tbody tr").length, 2);
});

// SIG-1208: one-line key-moment rows with the explanation inline under the active one.
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const momentRows = [
  { path: [0, 0, 0], san: "Nf3", side: "w" as const, label: "blunder" as const, index: 2, lossCp: 320, beforePawns: 0.3, afterPawns: -2.9, bestSan: "Nd5" },
  { path: [0, 0, 0, 0], san: "e5", side: "b" as const, label: "best" as const, index: 3, lossCp: 0, beforePawns: -2.9, afterPawns: -2.9, bestSan: null },
];

function renderMoments(
  selectedPath: number[] | null,
  onSelectMoment: (path: number[]) => void = () => {},
  extra: Partial<Parameters<typeof KeyMomentsList>[0]> = {},
) {
  return render(
    <KeyMomentsList
      moments={momentRows}
      moveNotation="english"
      locale="en"
      onSelectMoment={onSelectMoment}
      selectedPath={selectedPath}
      startFen={START_FEN}
      explanation={<p>because reasons</p>}
      {...extra}
    />,
  );
}

test("key moment rows show number, move, evals and the best move only when it differs", () => {
  const { container } = renderMoments(null);
  const rows = container.querySelectorAll("li > button:not([data-retry-button])");
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
  const rows = container.querySelectorAll("li > button:not([data-retry-button])");
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

// SIG-1209: Retry button on eligible rows.
test("SIG-1209: eligible rows get a Retry button that starts the retry without navigating", () => {
  const selected: number[][] = [];
  const retried: number[][] = [];
  const { container } = renderMoments(null, (path) => selected.push(path), {
    onRetry: (path) => retried.push(path),
    retryPaths: new Set(["0.0.0"]),
  });
  const buttons = container.querySelectorAll("[data-retry-button]");
  assert.equal(buttons.length, 1, "only the retryable row has the button");
  assert.equal(buttons[0].getAttribute("aria-label"), "Retry move 2, Nf3");
  assert.equal(buttons[0].textContent, "Retry");
  // Sibling of the row button, never nested inside it.
  assert.equal(buttons[0].closest("li > button"), null);
  fireEvent.click(buttons[0]);
  assert.deepEqual(retried, [[0, 0, 0]]);
  assert.deepEqual(selected, [], "the row did not navigate");
  // The row still navigates on its own click and keeps the one-line layout.
  const row = container.querySelector("li > button:not([data-retry-button])") as HTMLElement;
  assert.match(row.className, /min-w-0/);
  assert.ok(row.querySelector(".truncate"), "the best: text can still truncate");
});

test("SIG-1209: no Retry buttons without a handler or when the row is not retryable", () => {
  const { container } = renderMoments(null, () => {}, { retryPaths: new Set(["0.0.0"]) });
  assert.equal(container.querySelectorAll("[data-retry-button]").length, 0);
  cleanup();
  const second = renderMoments(null, () => {}, { onRetry: () => {}, retryPaths: new Set() });
  assert.equal(second.container.querySelectorAll("[data-retry-button]").length, 0);
});

test("SIG-1209: while a retry is active the best: text is hidden and the Why? stays collapsed", () => {
  const { container } = renderMoments([0, 0, 0], () => {}, { retryActive: true });
  assert.doesNotMatch(container.textContent ?? "", /best:/);
  assert.equal(container.querySelector("[data-export-ignore]"), null);
  const row = container.querySelector("li > button:not([data-retry-button])") as HTMLElement;
  assert.equal(row.getAttribute("aria-expanded"), null);
  assert.equal(row.getAttribute("title"), null);
});

// ---- SIG-1220: time section ------------------------------------------------------

const { buildTimeReport } = await import("@/src/chess/review-time.ts");

function timeView(onSelectMove?: (path: number[]) => void) {
  // 180+2: White spends 4.0, 2.7, 3.3, 28.0, 0.1, 13.4 s; Black 2.8, 1.8, 11.4, 0.1, 13.9, 62.0 s.
  const w = [178_000, 177_300, 176_000, 150_000, 151_900, 140_500];
  const b = [179_200, 179_400, 170_000, 171_900, 160_000, 100_000];
  const lw = ["book", "book", "best", "blunder", "veryGood", "mistake"] as const;
  const lb = ["book", "decent", "inaccuracy", "forced", "miss", "great"] as const;
  const rows = w.flatMap((clock, i) => [
    { side: "w" as const, phase: (i < 2 ? "opening" : "middlegame") as "opening" | "middlegame", label: lw[i], afterPawns: 0, clockMs: clock },
    { side: "b" as const, phase: (i < 2 ? "opening" : "middlegame") as "opening" | "middlegame", label: lb[i], afterPawns: 0, clockMs: b[i] },
  ]);
  const timeReport = buildTimeReport(rows, "180+2");
  assert.ok(timeReport);
  return {
    report: timeReport,
    moves: rows.map((_, i) => ({ path: [0, i], san: i === 6 ? "Qxf7+" : "e4" })),
    moveNotation: "english" as const,
    startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    onSelectMove,
  };
}

test("SIG-1220: no time prop renders no Time section and no markers", () => {
  render(<ReportSummary report={report} locale="en" />);
  assert.equal(document.querySelector("[data-report-section=time]"), null);
  assert.equal(document.querySelector("[data-time-marker]"), null);
  assert.equal(document.querySelector("[data-time-legend]"), null);
});

test("SIG-1220: the wide Time section lists the averages, longest think, premoves and Pace", () => {
  render(<ReportSummary report={report} locale="en" time={timeView()} />);
  const section = document.querySelector("[data-report-section=time]") as HTMLElement;
  assert.deepEqual(
    Array.from(section.querySelectorAll("[data-time-row]")).map((row) => row.getAttribute("data-time-row")),
    ["avg", "accurate", "inaccurate", "longest", "premoves", "pace"],
  );
  const accurate = within(section.querySelector("[data-time-row=accurate]") as HTMLElement);
  assert.ok(accurate.getByText("1.7s"), "White: (3.3 s + 0.1 s) / 2");
  assert.ok(accurate.getByText("31.9s"), "Black: (1.8 s + 62.0 s) / 2");
  const inaccurate = within(section.querySelector("[data-time-row=inaccurate]") as HTMLElement);
  assert.ok(inaccurate.getByText("20.7s"));
  assert.ok(inaccurate.getByText("12.7s"));
  const premoves = within(section.querySelector("[data-time-row=premoves]") as HTMLElement);
  assert.equal(premoves.getAllByText("1 move").length, 2);
  assert.equal(section.querySelectorAll("[data-pace]").length, 2);
  assert.ok(section.querySelector("svg"), "stars are SVG, not font glyphs");
});

test("SIG-1220: longest think shows badge, move and duration and jumps to the move", () => {
  const calls: number[][] = [];
  render(<ReportSummary report={report} locale="en" time={timeView((path) => calls.push(path))} />);
  const button = document.querySelector("[data-longest-think=w]") as HTMLElement;
  assert.ok(button.querySelector("[data-tier-badge=blunder]"));
  assert.match(button.textContent ?? "", /Qxf7\+/);
  assert.match(button.textContent ?? "", /28\.0s/);
  fireEvent.click(button);
  const black = document.querySelector("[data-longest-think=b]") as HTMLElement;
  assert.match(black.textContent ?? "", /1m 2s/);
  fireEvent.click(black);
  assert.deepEqual(calls, [
    [0, 6],
    [0, 11],
  ]);
});

test("SIG-1220: Pace has a tooltip note that opens on click", () => {
  render(<ReportSummary report={report} locale="en" time={timeView()} />);
  assert.equal(screen.queryByRole("note"), null);
  fireEvent.click(screen.getByRole("button", { name: /Pace/ }));
  assert.match(screen.getByRole("note").textContent ?? "", /book moves/);
});

test("SIG-1220: phase bars get a time marker at the side's share, plus a legend", () => {
  render(<ReportSummary report={report} locale="en" time={timeView()} />);
  const opening = document.querySelector("[data-phase=opening]") as HTMLElement;
  const markers = opening.querySelectorAll("[data-time-marker]");
  assert.equal(markers.length, 2);
  // White: (4.0 + 2.7) / 53.5 s.
  assert.equal((markers[0] as HTMLElement).style.left, `${(6700 / 51_500) * 100}%`);
  assert.ok(screen.getByText("Time usage"));
});

test("SIG-1220: compact layout keeps only the two averages and Pace, and no phase markers", () => {
  render(<ReportSummary report={report} locale="en" compact time={timeView()} />);
  const section = document.querySelector("[data-report-section=time]") as HTMLElement;
  assert.deepEqual(
    Array.from(section.querySelectorAll("[data-time-row]")).map((row) => row.getAttribute("data-time-row")),
    ["accurate", "inaccurate", "pace"],
  );
  assert.equal(document.querySelector("[data-time-marker]"), null);
  assert.equal(document.querySelector("[data-time-legend]"), null);
});

test("SIG-1220: pt-br uses decimal commas and translated labels", () => {
  render(<ReportSummary report={report} locale="pt-br" time={timeView()} />);
  const section = document.querySelector("[data-report-section=time]") as HTMLElement;
  assert.ok(within(section).getAllByText("Premoves").length >= 1);
  assert.ok(within(section.querySelector("[data-time-row=accurate]") as HTMLElement).getByText("1,7s"));
  assert.equal(within(section.querySelector("[data-time-row=premoves]") as HTMLElement).getAllByText("1 lance").length, 2);
  assert.ok(within(section).getByRole("button", { name: /Ritmo/ }));
});
