// SIG-1400: RepertoirePanel uses Badge/Button primitives and renders a training
// status card when free-line training is active instead of an empty body.
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { importPgn } from "@/src/chess/pgn";
import { getDueRepertoireMoves, repertoireMoveKey, type SpacedRepetitionItem } from "@/src/chess/repertoire";
import { createEmptyTree } from "@/src/chess/tree";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings.ts";
import { emptyBoard, useStudioStore } from "@/src/store/studio-store";
import { RepertoirePanel } from "./RepertoirePanel";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

function markAllReviewed(pgn: string): Record<string, SpacedRepetitionItem> {
  const { tree } = importPgn(pgn);
  const future = new Date(Date.now() + 86400000 * 30).toISOString();
  const reviewed: Record<string, SpacedRepetitionItem> = {};
  for (const item of getDueRepertoireMoves(tree, {})) {
    reviewed[repertoireMoveKey(item.fen, item.uci)] = {
      dueDate: future,
      intervalDays: 1,
      easeFactor: 2.5,
      lastReviewedAt: future,
      mistakeCount: 0,
    };
  }
  return reviewed;
}

beforeEach(() => {
  const baseBoard = emptyBoard("Repertoire", "rep-board");
  const { tree } = importPgn("1. e4 e5 *");
  useStudioStore.setState({
    boards: [{ ...baseBoard, tree, path: [] }],
    activeBoardId: "rep-board",
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    training: false,
    trainingStart: null,
    drillDueOnly: false,
    repertoireProgress: {},
  });
});

test("uses Badge (no bg-studio-surface-raised) with accent tone when due > 0 and neutral when 0", () => {
  const { container, rerender } = render(<RepertoirePanel />);
  assert.equal(container.innerHTML.includes("bg-studio-surface-raised"), false);

  const dueBadge = screen.getByText("2 Due");
  assert.match(dueBadge.className, /\bbg-studio-accent-soft\b/);
  assert.match(dueBadge.className, /\btext-studio-accent-text\b/);

  act(() => {
    useStudioStore.setState({ repertoireProgress: markAllReviewed("1. e4 e5 *") });
  });
  rerender(<RepertoirePanel />);

  const zeroBadge = screen.getByText("0 Due");
  assert.match(zeroBadge.className, /\bbg-studio-hover-strong\b/);
  assert.match(zeroBadge.className, /\btext-studio-muted\b/);
});

test("header buttons use Button primitives and preserve disabled and click handlers", () => {
  const { rerender } = render(<RepertoirePanel />);

  const trainButton = screen.getByRole("button", { name: "Train" }) as HTMLButtonElement;
  const drillButton = screen.getByRole("button", { name: "Drill Due" }) as HTMLButtonElement;

  for (const btn of [trainButton, drillButton]) {
    assert.match(btn.className, /\binline-flex\b/);
    assert.match(btn.className, /\bh-7\b/);
    assert.match(btn.className, /\brounded-lg\b/);
  }
  assert.match(trainButton.className, /\bbg-studio-hover-strong\b/);
  assert.match(drillButton.className, /\bbg-studio-accent-solid\b/);
  assert.equal(drillButton.disabled, false);

  act(() => {
    useStudioStore.setState({ repertoireProgress: markAllReviewed("1. e4 e5 *") });
  });
  rerender(<RepertoirePanel />);
  assert.equal((screen.getByRole("button", { name: "Drill Due" }) as HTMLButtonElement).disabled, true);

  fireEvent.click(screen.getByRole("button", { name: "Train" }));
  assert.equal(useStudioStore.getState().training, true);
  assert.equal(useStudioStore.getState().drillDueOnly, false);
});

test("renders a training status card when training && !drillDueOnly with moves remaining", () => {
  useStudioStore.setState({ training: true, trainingStart: [], drillDueOnly: false });

  const { container } = render(<RepertoirePanel />);
  assert.equal(container.innerHTML.includes("bg-studio-surface-raised"), false);

  const card = screen.getByTestId("repertoire-training-card");
  assert.ok(card);
  assert.ok(within(card).getByText("Training active — play your repertoire move on the board."));

  const restartButtons = screen.getAllByRole("button", { name: "Train again" });
  const stopButtons = screen.getAllByRole("button", { name: "Stop" });
  assert.equal(restartButtons.length, 2);
  assert.equal(stopButtons.length, 2);
  for (const btn of [...restartButtons, ...stopButtons]) {
    assert.match(btn.className, /\bh-7\b/);
    assert.match(btn.className, /\brounded-lg\b/);
  }

  // Advance path inside the line, then restart from the card control.
  act(() => {
    useStudioStore.getState().goPath([0]);
  });
  fireEvent.click(within(card).getByRole("button", { name: "Train again" }));
  assert.deepEqual(useStudioStore.getState().boards[0].path, []);

  fireEvent.click(within(card).getByRole("button", { name: "Stop" }));
  assert.equal(useStudioStore.getState().training, false);
});

test("renders line-complete message in training status card when no moves remain", () => {
  const board = useStudioStore.getState().boards[0];
  useStudioStore.setState({
    boards: [{ ...board, path: [0, 0] }],
    training: true,
    trainingStart: [],
    drillDueOnly: false,
  });

  render(<RepertoirePanel />);
  const card = screen.getByTestId("repertoire-training-card");
  assert.ok(within(card).getByText("Line complete."));
  assert.equal(
    within(card).queryByText("Training active — play your repertoire move on the board."),
    null,
  );
  const restartButton = within(card).getByRole("button", { name: "Train again" });
  assert.match(restartButton.className, /\bbg-studio-accent-solid\b/);
});

test("translates training status card strings in pt-br", () => {
  const board = useStudioStore.getState().boards[0];
  useStudioStore.setState({
    settings: { ...DEFAULT_SETTINGS, locale: "pt-br" },
    training: true,
    trainingStart: [],
    drillDueOnly: false,
  });

  const { rerender } = render(<RepertoirePanel />);
  assert.ok(screen.getByText("Treino ativo — jogue o lance do seu repertório no tabuleiro."));

  act(() => {
    useStudioStore.setState({
      boards: [{ ...board, tree: createEmptyTree(), path: [] }],
    });
  });
  rerender(<RepertoirePanel />);
  assert.ok(screen.getByText("Linha concluída."));
});

test("renders Button controls during drillDueOnly mode", () => {
  useStudioStore.setState({ training: true, trainingStart: [], drillDueOnly: true });

  render(<RepertoirePanel />);
  assert.ok(screen.getByText("Drilling due moves (2 remaining)"));
  const drillButton = screen.getByRole("button", { name: "Drill Due" });
  const stopButton = screen.getByRole("button", { name: "Stop" });
  assert.match(drillButton.className, /\bbg-studio-accent-solid\b/);
  assert.match(stopButton.className, /\btext-studio-muted\b/);
});
