// SIG-1400: RepertoirePanel uses Badge/Button primitives and renders a training
// status card when free-line training is active instead of an empty body.
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { importPgn } from "@/src/chess/pgn";
import { getDueRepertoireMoves, type SpacedRepetitionItem } from "@/src/chess/repertoire";
import { createEmptyTree } from "@/src/chess/tree";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings.ts";
import { emptyBoard, useStudioStore } from "@/src/store/studio-store";
import { RepertoirePanel } from "./RepertoirePanel";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

function markWhiteMovesReviewed(pgn: string): Record<string, SpacedRepetitionItem> {
  const { tree } = importPgn(pgn);
  const future = new Date(Date.now() + 86400000 * 30).toISOString();
  const reviewed: Record<string, SpacedRepetitionItem> = {};
  for (const item of getDueRepertoireMoves(tree, {}, "w")) {
    reviewed[item.key] = {
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
    trainingMiss: null,
    drillDueOnly: false,
    repertoireProgress: {},
  });
});

test("uses Badge (no bg-studio-surface-raised) with accent tone when due > 0 and neutral when 0", () => {
  const { container, rerender } = render(<RepertoirePanel />);
  assert.equal(container.innerHTML.includes("bg-studio-surface-raised"), false);

  const dueBadge = screen.getByText("1 Due");
  assert.match(dueBadge.className, /\bbg-studio-accent-soft\b/);
  assert.match(dueBadge.className, /\btext-studio-accent-text\b/);

  act(() => {
    useStudioStore.setState({ repertoireProgress: markWhiteMovesReviewed("1. e4 e5 *") });
  });
  rerender(<RepertoirePanel />);

  const zeroBadge = screen.getByText("0 Due");
  assert.match(zeroBadge.className, /\bbg-studio-hover-strong\b/);
  assert.match(zeroBadge.className, /\btext-studio-muted\b/);
});

test("opens each marked board and shows due counts from both repertoire trees", () => {
  const game = useStudioStore.getState().boards[0];
  const white = {
    ...emptyBoard("White", "white"),
    repertoireColor: "white" as const,
    tree: importPgn("1. d4 d5 2. c4 *").tree,
  };
  const black = {
    ...emptyBoard("Black", "black"),
    repertoireColor: "black" as const,
    tree: importPgn("1. c4 e5 *").tree,
  };
  useStudioStore.setState({ boards: [game, white, black] });
  render(<RepertoirePanel />);

  const whiteRadio = screen.getByRole("radio", { name: "White 2" });
  const blackRadio = screen.getByRole("radio", { name: "Black 1" });
  assert.equal(whiteRadio.getAttribute("aria-checked"), "false");
  assert.equal(blackRadio.getAttribute("aria-checked"), "false");
  assert.equal(whiteRadio.tabIndex, 0);
  assert.ok(screen.getByText("This board is not a repertoire"));
  assert.ok(screen.getByRole("button", { name: "e4" }));
  fireEvent.click(screen.getByRole("button", { name: "Train" }));
  assert.equal(useStudioStore.getState().training, true);

  fireEvent.click(whiteRadio);
  assert.equal(useStudioStore.getState().activeBoardId, white.id);
  assert.equal(useStudioStore.getState().training, false);
  assert.equal(whiteRadio.getAttribute("aria-checked"), "true");
  assert.equal(screen.queryByText("This board is not a repertoire"), null);
  assert.ok(screen.getByText("2 Due"));
  assert.ok(screen.getByRole("button", { name: "d4" }));

  fireEvent.keyDown(whiteRadio, { key: "ArrowRight" });
  assert.equal(useStudioStore.getState().activeBoardId, black.id);
  assert.equal(blackRadio.getAttribute("aria-checked"), "true");
  assert.ok(screen.getByText("1 Due"));
  assert.ok(screen.getByRole("button", { name: "c4" }));
});

test("offers to mark the active board when the selected repertoire is missing", () => {
  render(<RepertoirePanel />);
  fireEvent.click(screen.getByRole("radio", { name: "White 0" }));

  assert.ok(screen.getByText("No board is marked as the White repertoire."));
  assert.ok(screen.getByRole("button", { name: "Create repertoire" }));
  fireEvent.click(screen.getByRole("button", { name: "Mark this board" }));

  const { boards, activeBoardId } = useStudioStore.getState();
  assert.equal(activeBoardId, "rep-board");
  assert.equal(boards.length, 1);
  assert.equal(boards[0].repertoireColor, "white");
  assert.equal(screen.getByRole("radio", { name: "White 1" }).getAttribute("aria-checked"), "true");
  assert.equal(screen.queryByRole("button", { name: "Mark this board" }), null);
  assert.ok(screen.getByRole("button", { name: "e4" }));
});

test("creates and activates an empty repertoire with a localized title", () => {
  const game = useStudioStore.getState().boards[0];
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });
  render(<RepertoirePanel />);

  fireEvent.click(screen.getByRole("radio", { name: "Pretas 0" }));
  assert.ok(screen.getByText("Este tabuleiro não é um repertório"));
  assert.ok(screen.getByText("Nenhum tabuleiro está marcado como repertório de Pretas."));
  assert.ok(screen.getByRole("button", { name: "Marcar este tabuleiro" }));
  fireEvent.click(screen.getByRole("button", { name: "Criar repertório" }));

  const { boards, activeBoardId } = useStudioStore.getState();
  assert.equal(boards.length, 2);
  assert.deepEqual(boards[0], game);
  const created = boards[1];
  assert.equal(activeBoardId, created.id);
  assert.equal(created.repertoireColor, "black");
  assert.equal(created.title, "Repertório de Pretas");
  assert.deepEqual(created.tree, createEmptyTree());
  assert.equal(screen.getByRole("radio", { name: "Pretas 0" }).getAttribute("aria-checked"), "true");
  assert.ok(screen.getByText("Sem lances guardados aqui."));
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
    useStudioStore.setState({ repertoireProgress: markWhiteMovesReviewed("1. e4 e5 *") });
  });
  rerender(<RepertoirePanel />);
  assert.equal((screen.getByRole("button", { name: "Drill Due" }) as HTMLButtonElement).disabled, true);

  fireEvent.click(screen.getByRole("button", { name: "Train" }));
  assert.equal(useStudioStore.getState().training, true);
  assert.equal(useStudioStore.getState().drillDueOnly, false);
});

test("counts only the repertoire color and disables the drill when only opponent moves are due", () => {
  const board = useStudioStore.getState().boards[0];
  useStudioStore.setState({
    boards: [{ ...board, orientation: "black", repertoireColor: "white" }],
    settings: { ...DEFAULT_SETTINGS, locale: "pt-br" },
    repertoireProgress: markWhiteMovesReviewed("1. e4 e5 *"),
  });

  render(<RepertoirePanel />);
  assert.ok(screen.getByText("0 a vencer"));
  const drillButton = screen.getByRole("button", { name: "Treinar vencidas" }) as HTMLButtonElement;
  assert.equal(drillButton.disabled, true);

  act(() => {
    useStudioStore.setState({ boards: [{ ...board, orientation: "black" }] });
  });
  assert.ok(screen.getByText("1 a vencer"));
  assert.equal(drillButton.disabled, false);
});

test("renders a training status card when training && !drillDueOnly with moves remaining", () => {
  useStudioStore.setState({ training: true, trainingStart: [], drillDueOnly: false });

  const { container } = render(<RepertoirePanel />);
  assert.equal(container.innerHTML.includes("bg-studio-surface-raised"), false);

  const card = screen.getByTestId("repertoire-training-card");
  assert.ok(card);
  assert.ok(within(card).getByText("Training active — play your repertoire move on the board."));

  // The header owns the controls; the card only reports status (one button per name).
  const restartButton = screen.getByRole("button", { name: "Train again" });
  const stopButton = screen.getByRole("button", { name: "Stop" });
  assert.equal(within(card).queryAllByRole("button").length, 0);
  for (const btn of [restartButton, stopButton]) {
    assert.match(btn.className, /\bh-7\b/);
    assert.match(btn.className, /\brounded-lg\b/);
  }

  act(() => {
    useStudioStore.getState().goPath([0]);
  });
  fireEvent.click(restartButton);
  assert.deepEqual(useStudioStore.getState().boards[0].path, []);

  fireEvent.click(stopButton);
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
  assert.match(card.className, /\bfont-medium\b/);
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
  useStudioStore.getState().startDueDrill();

  render(<RepertoirePanel />);
  assert.ok(screen.getByText("Reviewing: 1 of 1"));
  const drillButton = screen.getByRole("button", { name: "Drill Due" });
  const stopButton = screen.getByRole("button", { name: "Stop" });
  assert.match(drillButton.className, /\bbg-studio-accent-solid\b/);
  assert.match(stopButton.className, /\btext-studio-muted\b/);
});

for (const [locale, progress, skip] of [
  ["en", "Reviewing: 2 of 2", "Skip animation"],
  ["pt-br", "Revisando: 2 de 2", "Pular animação"],
] as const) {
  test(`shows progress and skips replay in ${locale}`, (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const store = useStudioStore.getState();
    const board = store.active();
    useStudioStore.setState({
      boards: [{ ...board, tree: importPgn("1. e4 e5 2. Nf3 *").tree }],
      settings: { ...DEFAULT_SETTINGS, locale },
    });
    store.startDueDrill();
    render(<RepertoirePanel />);
    act(() => { store.makeUciMove("e2", "e4"); });

    assert.equal(screen.getByRole("status").textContent, progress);
    fireEvent.click(screen.getByRole("button", { name: skip }));
    assert.deepEqual(useStudioStore.getState().active().path, [0, 0]);
    assert.equal(screen.queryByRole("button", { name: skip }), null);
    assert.equal(screen.getByRole("status").textContent, progress);
  });
}

for (const [locale, feedback, hint] of [
  ["en", "Not in your repertoire", "Hint"],
  ["pt-br", "Não está no repertório", "Dica"],
] as const) {
  test(`shows localized mistake feedback and advances hints in ${locale}`, () => {
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale } });
    const store = useStudioStore.getState();
    if (locale === "pt-br") {
      store.startDueDrill();
    } else {
      store.startTraining();
    }
    render(<RepertoirePanel />);
    assert.equal(screen.queryByRole("button", { name: hint }), null);

    act(() => { store.makeUciMove("d2", "d4"); });
    assert.equal(screen.getByRole("status").textContent, feedback);
    const button = screen.getByRole("button", { name: hint }) as HTMLButtonElement;
    fireEvent.click(button);
    assert.equal(useStudioStore.getState().trainingMiss?.hint, 1);
    fireEvent.click(button);
    assert.equal(useStudioStore.getState().trainingMiss?.hint, 2);
    assert.equal(button.disabled, true);

    act(() => { store.stopTraining(); });
    assert.equal(screen.queryByRole("button", { name: hint }), null);
  });
}

test("opens Add variation with the active repertoire color selected", async () => {
  const [board] = useStudioStore.getState().boards;
  useStudioStore.setState({ boards: [{ ...board, repertoireColor: "black" }] });
  render(<RepertoirePanel />);
  fireEvent.click(screen.getByRole("button", { name: "Add variation" }));
  const dialog = screen.getByRole("dialog", { name: "Add variation" });
  assert.equal(within(dialog).getByRole("radio", { name: "Black" }).getAttribute("aria-checked"), "true");
  await within(dialog).findByRole("button", { name: "Sicilian Defense" });
});
