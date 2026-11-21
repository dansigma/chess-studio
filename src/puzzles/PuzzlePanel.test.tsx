import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, render, screen, within } from "@testing-library/react";
import { compilePuzzle, emptyProgress } from "./engine";
import type { PuzzleFeedback } from "./use-puzzle-feedback";
import type { PuzzleSession } from "./use-puzzle-session";

mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({ push() {} }),
  },
});

const { PuzzlePanel } = await import("./PuzzlePanel.tsx");

const SAMPLE_PUZZLE = compilePuzzle({
  id: "00sHx",
  fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
  moves: ["Re8#"],
  rating: 1200,
  themes: ["mate", "mateIn1"],
});

function makeSession(overrides: Partial<PuzzleSession> = {}): PuzzleSession {
  return {
    puzzle: SAMPLE_PUZZLE,
    fen: SAMPLE_PUZZLE.endFen,
    ply: 1,
    status: "solved",
    last: { from: "e1", to: "e8" },
    viewPly: null,
    scrubFrames: [],
    canScrub: true,
    stepView: () => {},
    selected: null,
    hintLevel: 0,
    reveal: false,
    miss: null,
    wrongTick: 0,
    correctTick: 0,
    sessionSolved: 1,
    strikes: 0,
    sessionOver: false,
    secondsLeft: 180,
    loadError: false,
    exhausted: false,
    caughtUp: false,
    nextDue: null,
    mistakesTotal: 0,
    mistakesIndex: 0,
    progress: emptyProgress(),
    delta: 16,
    gained: 24,
    xpResult: null,
    sessionXp: 24,
    sessionStart: emptyProgress(),
    attempts: [],
    summaryVisible: false,
    dueMistakes: null,
    finishSession: () => {},
    userTurn: false,
    expected: undefined,
    onDrop: () => true,
    giveUp: () => {},
    nextPuzzle: () => {},
    retry: () => {},
    setSelected: () => {},
    setHintLevel: () => {},
    ...overrides,
  };
}

function makeFeedback(overrides: Partial<PuzzleFeedback> = {}): PuzzleFeedback {
  return {
    dests: [],
    orientation: "white",
    solverMoves: 1,
    solverIndex: 1,
    modeLabel: "Rated",
    continueLabel: "Next puzzle",
    sideToMove: "White",
    runStreak: 1,
    level: { level: 1, into: 24, span: 100, toNext: 76 },
    bubbleTitle: "Solved",
    bubbleBody: "Great stuff!",
    squareStyles: {},
    arrows: [],
    ...overrides,
  };
}

before(() => setupDom());
after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
});

test("post-attempt CTAs render primary Continue above secondary Analyze in Studio", () => {
  render(
    <PuzzlePanel
      mode="rated"
      theme={null}
      session={makeSession({ status: "solved" })}
      feedback={makeFeedback({ continueLabel: "Next puzzle" })}
      locale="en"
    />,
  );

  const nextButton = screen.getByRole("button", { name: "Next puzzle" });
  const analyzeButton = screen.getByRole("button", { name: "Analyze in Studio" });
  const buttons = screen.getAllByRole("button");
  assert.ok(
    buttons.indexOf(nextButton) < buttons.indexOf(analyzeButton),
    "Next puzzle must appear above Analyze in Studio",
  );
});

test("active Rush hides Analyze in Studio, while ended Rush shows it", () => {
  const view = render(
    <PuzzlePanel
      mode="rush"
      theme={null}
      session={makeSession({ status: "failed", sessionOver: false })}
      feedback={makeFeedback({ modeLabel: "Rush", continueLabel: null })}
      locale="en"
    />,
  );
  assert.equal(screen.queryByRole("button", { name: "Analyze in Studio" }), null);

  view.rerender(
    <PuzzlePanel
      mode="rush"
      theme={null}
      session={makeSession({ status: "failed", sessionOver: true })}
      feedback={makeFeedback({ modeLabel: "Rush", continueLabel: null })}
      locale="en"
    />,
  );
  screen.getByRole("button", { name: "Analyze in Studio" });
});

test("mistakes mode renders X of Y queue progress and active phase/tier filter pill with clear link", () => {
  const view = render(
    <PuzzlePanel
      mode="mistakes"
      theme={null}
      mistakeFilter={{ phase: "endgame", label: "blunder" }}
      session={makeSession({ status: "playing", userTurn: true, mistakesTotal: 5, mistakesIndex: 1 })}
      feedback={makeFeedback({ modeLabel: "My mistakes", continueLabel: "Next puzzle" })}
      locale="en"
    />,
  );

  assert.equal(screen.getByTestId("mistakes-queue-progress").textContent, "2 of 5");
  const chip = screen.getByTestId("mistakes-filter-chip");
  assert.match(chip.textContent ?? "", /Endgame · Blunder/);
  const clearLink = within(chip).getByRole("link", { name: "Clear filter" });
  assert.equal(clearLink.getAttribute("href"), "/puzzles/play?mode=mistakes");

  view.rerender(
    <PuzzlePanel
      mode="mistakes"
      theme={null}
      mistakeFilter={{ phase: "opening", label: "mistake" }}
      session={makeSession({ status: "playing", userTurn: true, mistakesTotal: 4, mistakesIndex: 0 })}
      feedback={makeFeedback({ modeLabel: "Meus erros", continueLabel: "Próximo problema" })}
      locale="pt-br"
    />,
  );

  assert.equal(screen.getByTestId("mistakes-queue-progress").textContent, "1 de 4");
  const ptChip = screen.getByTestId("mistakes-filter-chip");
  assert.match(ptChip.textContent ?? "", /Abertura · Erro/);
  within(ptChip).getByRole("link", { name: "Limpar filtro" });
});
