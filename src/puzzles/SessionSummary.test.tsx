import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { localDayKey } from "./activity";
import { emptyProgress } from "./engine";
import { SessionSummary } from "./SessionSummary.tsx";
import { buildSessionSummary, type SessionAttempt } from "./session-summary";
import type { PuzzleMode, PuzzleProgress } from "./types";
import { cumulativeXpForLevel, xpBreakdown } from "./xp";
import { openPuzzleInStudio, type StudioPuzzle } from "./studio-handoff";

before(() => {
  setupDom();
});
after(() => {
  teardownDom();
});

const NOW = new Date(2026, 10, 5, 12, 0, 0).getTime();
const day = { solved: 1, failed: 0, ms: 1000, xp: 0 };
const yesterday = localDayKey(NOW - 86_400_000);
const today = localDayKey(NOW);

const PUZZLE = { id: "00sHx", fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", sans: ["Re8#"] };

function attempt(success: boolean, ms = 12_000, id = "00sHx"): SessionAttempt {
  const breakdown = xpBreakdown({ success, puzzleRating: 1200, userRating: 1200, solverMoves: 1, ms, hinted: false });
  return { success, firstTry: success, ms, at: NOW, puzzle: { ...PUZZLE, id }, xp: { breakdown, awarded: true } };
}

function progress(over: Partial<PuzzleProgress> = {}): PuzzleProgress {
  return { ...emptyProgress(), ...over };
}

function summaryFor(mode: PuzzleMode, attempts: SessionAttempt[], xpGain = 40, extra: Partial<PuzzleProgress> = {}) {
  const start = progress({ rating: 1200, xp: cumulativeXpForLevel(6) + 50, days: { [yesterday]: day } });
  return buildSessionSummary({
    mode,
    attempts,
    before: start,
    after: progress({
      rating: 1200 + (mode === "rated" ? 18 : 0),
      xp: start.xp + (mode === "mistakes" ? 0 : xpGain),
      days: { [yesterday]: day, [today]: day },
      ...extra,
    }),
  });
}

function mount(
  summary: ReturnType<typeof summaryFor>,
  locale: "en" | "pt-br" = "en",
  canReview = false,
  onAnalyze?: (puzzle: StudioPuzzle) => void,
) {
  render(
    <SessionSummary
      summary={summary}
      locale={locale}
      onTrainAgain={() => {}}
      canReview={canReview}
      onAnalyze={onAnalyze}
    />,
  );
}

function cardTitle(): string {
  return screen.getByTestId("summary-card-title").textContent ?? "";
}

test("rated: three cards, stepped with Next and Back, ending in the actions", () => {
  try {
    mount(summaryFor("rated", [attempt(true), attempt(true), attempt(false)]), "en", true);
    const region = screen.getByRole("region", { name: "Session summary" });
    assert.ok(region);
    assert.equal(screen.getByTestId("summary-step").textContent, "Step 1 of 3");
    assert.equal(cardTitle(), "What you did");
    // card 1: time, solved, first try, failed, cheer, day streak
    const text = region.textContent ?? "";
    assert.match(text, /Training time/);
    assert.match(text, /36\.0s/);
    assert.match(text, /Correct on the first try/);
    assert.ok(screen.getByTestId("summary-cheer").textContent);
    assert.equal(screen.getByTestId("summary-day-streak").textContent, "Day 2");
    assert.equal(screen.queryByRole("button", { name: "Train again" }), null);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    assert.equal(cardTitle(), "Level progress");
    assert.equal(screen.getByTestId("summary-xp").textContent, "+40 XP");
    assert.equal(screen.queryByTestId("summary-level-up"), null);
    screen.getByRole("progressbar");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    assert.equal(cardTitle(), "Rating");
    assert.equal(screen.getByTestId("summary-rating-change").textContent, "+18");
    assert.match(region.textContent ?? "", /1,200/);
    assert.match(region.textContent ?? "", /1,218/);
    assert.match(region.textContent ?? "", /67%/);
    assert.match(region.textContent ?? "", /12\.0s/);
    screen.getByRole("img", { name: "2 solved, 1 failed" });
    assert.equal(screen.queryAllByTestId("summary-puzzle-row").length, 0, "the list lives on the first card");
    // last card: the three buttons, no Next
    screen.getByRole("button", { name: "Train again" });
    screen.getByRole("link", { name: "Review my mistakes" });
    screen.getByRole("link", { name: "Back to puzzles" });
    assert.equal(screen.queryByRole("button", { name: "Next" }), null);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    assert.equal(cardTitle(), "Level progress");
  } finally {
    cleanup();
  }
});

test("arrow keys step through the cards", () => {
  try {
    mount(summaryFor("rated", [attempt(true)]));
    const region = screen.getByRole("region");
    fireEvent.keyDown(region, { key: "ArrowRight" });
    assert.equal(cardTitle(), "Level progress");
    fireEvent.keyDown(region, { key: "ArrowRight" });
    assert.equal(cardTitle(), "Rating");
    fireEvent.keyDown(region, { key: "ArrowRight" });
    assert.equal(cardTitle(), "Rating", "stops at the last card");
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    assert.equal(cardTitle(), "Level progress");
  } finally {
    cleanup();
  }
});

test("focus moves to the summary when it appears and to the card heading when stepping", () => {
  try {
    mount(summaryFor("rated", [attempt(true)]));
    assert.equal(document.activeElement?.id, "session-summary-title");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    assert.equal(document.activeElement?.getAttribute("data-testid"), "summary-card-title");
  } finally {
    cleanup();
  }
});

for (const mode of ["streak", "rush", "daily"] as const) {
  test(`${mode}: two cards, no rating card`, () => {
    try {
      mount(summaryFor(mode, [attempt(true), attempt(false)], 24, { rushBest: 7, bestStreak: 5 }));
      assert.equal(screen.getByTestId("summary-step").textContent, "Step 1 of 2");
      assert.equal(cardTitle(), "What you did");
      if (mode === "rush") {
        screen.getByText("Best 7");
      }
      if (mode === "streak") {
        screen.getByText("1 in a row · best 5");
      }
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      assert.equal(cardTitle(), "Level progress");
      assert.equal(screen.getByTestId("summary-xp").textContent, "+24 XP");
      assert.equal(screen.queryByRole("img"), null, "no solved/failed rating bar");
      screen.getByRole("button", { name: "Train again" });
      screen.getByRole("link", { name: "Back to puzzles" });
      assert.equal(screen.queryByRole("link", { name: "Review my mistakes" }), null);
    } finally {
      cleanup();
    }
  });
}

test("mistakes: practice only on the level card, no XP and no rating card", () => {
  try {
    mount(summaryFor("mistakes", [attempt(true), attempt(false)]));
    assert.equal(screen.getByTestId("summary-step").textContent, "Step 1 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    assert.equal(screen.getByTestId("summary-xp").textContent, "Practice only, not added to your XP");
    assert.equal(screen.queryByText(/\+\d+ XP/), null);
    screen.getByRole("button", { name: "Train again" });
  } finally {
    cleanup();
  }
});

test("a level change shows the level-up moment", () => {
  try {
    mount(summaryFor("streak", [attempt(true)], 500));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const up = screen.getByTestId("summary-level-up");
    assert.match(up.textContent ?? "", /Level up!/);
    assert.match(up.textContent ?? "", /Level 6 → 7/);
    assert.equal(screen.getByTestId("summary-xp").textContent, "+500 XP");
  } finally {
    cleanup();
  }
});

test("pt-BR strings, including the encouraging line", () => {
  try {
    mount(summaryFor("rated", [attempt(true), attempt(false)]), "pt-br");
    screen.getByRole("region", { name: "Resumo da sessão" });
    assert.equal(cardTitle(), "O que você fez");
    screen.getByText("Tempo de treino");
    assert.equal(screen.getByTestId("summary-day-streak").textContent, "Dia 2");
    assert.match(screen.getByTestId("summary-cheer").textContent ?? "", /[a-zç]/i);
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    assert.equal(cardTitle(), "Progresso de nível");
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    assert.equal(cardTitle(), "Rating");
    screen.getByRole("button", { name: "Treinar de novo" });
    screen.getByRole("link", { name: "Voltar aos problemas" });
  } finally {
    cleanup();
  }
});

test("reduced motion: the level bar renders at its end state immediately", () => {
  try {
    setupDom({ matchMediaMatches: true });
    mount(summaryFor("streak", [attempt(true)], 30));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const bar = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    const into = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
    const span = Number(screen.getByRole("progressbar").getAttribute("aria-valuemax"));
    assert.equal(bar.style.width, `${(into / span) * 100}%`);
  } finally {
    cleanup();
    setupDom();
  }
});

test("the list shows each puzzle with its result, XP breakdown and the Studio action", () => {
  try {
    const opened: string[] = [];
    mount(summaryFor("rated", [attempt(true, 5_000, "aaaaa"), attempt(false, 9_000, "bbbbb")]), "en", false, (puzzle) =>
      opened.push(puzzle.id),
    );
    const rows = screen.getAllByTestId("summary-puzzle-row");
    assert.equal(rows.length, 2);
    assert.match(rows[0]?.textContent ?? "", /\+36 XP · 20 solved × 1.5 fast × 1.2 first try/);
    assert.match(rows[1]?.textContent ?? "", /\+0 XP · No XP for a missed puzzle/);
    within(rows[0] as HTMLElement).getByRole("img", { name: "Solved" });
    within(rows[1] as HTMLElement).getByRole("img", { name: "Failed" });
    fireEvent.click(screen.getByRole("button", { name: "Analyze puzzle 2 in Studio" }));
    assert.deepEqual(opened, ["bbbbb"]);
    assert.equal(screen.queryByRole("button", { name: /Show all/ }), null, "no toggle up to 10 puzzles");
  } finally {
    cleanup();
  }
});

test("daily: one row with the Studio action that runs the real handoff", () => {
  try {
    const pushed: string[] = [];
    mount(summaryFor("daily", [attempt(true)]), "en", false, (puzzle) =>
      openPuzzleInStudio(puzzle, "daily", "en", (href) => pushed.push(href), "https://example.test"),
    );
    assert.equal(screen.getAllByTestId("summary-puzzle-row").length, 1);
    fireEvent.click(screen.getByRole("button", { name: "Analyze puzzle 1 in Studio" }));
    assert.deepEqual(pushed.length, 1);
    assert.ok(pushed[0] === "/studio" || pushed[0]?.startsWith("https://example.test"), pushed[0]);
  } finally {
    cleanup();
  }
});

test("the list shows the last 10 and a show-all toggle", () => {
  try {
    mount(summaryFor("rated", Array.from({ length: 12 }, () => attempt(true))), "en", false, () => {});
    assert.equal(screen.getAllByTestId("summary-puzzle-row").length, 10);
    fireEvent.click(screen.getByRole("button", { name: "Show all (12)" }));
    assert.equal(screen.getAllByTestId("summary-puzzle-row").length, 12);
    fireEvent.click(screen.getByRole("button", { name: "Show last 10" }));
    assert.equal(screen.getAllByTestId("summary-puzzle-row").length, 10);
  } finally {
    cleanup();
  }
});

test("mistakes rows say practice only instead of XP", () => {
  try {
    mount(summaryFor("mistakes", [attempt(true), attempt(false)]), "en", false, () => {});
    for (const row of screen.getAllByTestId("summary-puzzle-xp")) {
      assert.equal(row.textContent, "practice only");
    }
  } finally {
    cleanup();
  }
});

test("pt-BR list: breakdown, action and singular/plural in text and aria-labels", () => {
  try {
    mount(summaryFor("rated", [attempt(true), attempt(true), attempt(false)]), "pt-br", false, () => {});
    const text = screen.getByTestId("summary-puzzles").textContent ?? "";
    assert.match(text, /\+30 XP · 20 resolvido × 1,27 rápido × 1,2 de primeira/);
    screen.getByRole("button", { name: "Analisar o problema 3 no Studio" });
    screen.getByRole("img", { name: "Errado" });
    screen.getByText("Errado", { selector: "dt" });
    screen.getByText("Resolvidos", { selector: "dt" });
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    screen.getByRole("img", { name: "2 resolvidos, 1 errado" });
  } finally {
    cleanup();
  }
});

test("a single failure reads 'Failed' and '1 errado'", () => {
  try {
    mount(summaryFor("rated", [attempt(true), attempt(false)]), "pt-br");
    screen.getByText("Certo de primeira", { selector: "dt" });
    screen.getByText("Errado", { selector: "dt" });
  } finally {
    cleanup();
  }
});
