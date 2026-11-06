import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { localDayKey } from "./activity";
import { emptyProgress } from "./engine";
import { SessionSummary } from "./SessionSummary.tsx";
import { buildSessionSummary, type SessionAttempt } from "./session-summary";
import type { PuzzleMode, PuzzleProgress } from "./types";
import { cumulativeXpForLevel } from "./xp";

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

function attempt(success: boolean, ms = 12_000): SessionAttempt {
  return { success, firstTry: success, ms, at: NOW };
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

function mount(summary: ReturnType<typeof summaryFor>, locale: "en" | "pt-br" = "en", canReview = false) {
  render(
    <SessionSummary summary={summary} locale={locale} onTrainAgain={() => {}} canReview={canReview} />,
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
