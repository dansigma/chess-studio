// SIG-1341: the dossier's openings area — cards, colour tabs, selection and
// the "Prepare line" flow (board oriented to the user's side + Studio view).
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../../../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { PlayerGame } from "@/src/lib/player-types";

const openBoardPanel = mock.fn();
const openExplorerPanel = mock.fn();
mock.module("../../dock-api", { namedExports: { openBoardPanel, openExplorerPanel } });

const { DossierOpenings } = await import("./DossierOpenings.tsx");
const { useDossierStore } = await import("./dossier-store.ts");
const { useStudioStore, selectActiveBoard } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { DEFAULT_OVERVIEW_FILTERS } = await import("@/src/lib/my-games/overview-filters.ts");

const realImportPlayerGame = useStudioStore.getState().importPlayerGame;
const realFlip = useStudioStore.getState().flip;

function game(id: string, overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id,
    winner: null,
    whiteName: "Player",
    whiteRating: null,
    blackName: "Other",
    blackRating: null,
    year: 2024,
    month: 1,
    event: null,
    eco: "C50",
    opening: "Italian Game",
    color: "white",
    playerResult: "win",
    playedAt: Date.UTC(2024, 0, 1),
    timeClass: "blitz",
    moves: "e4 e5 Nf3",
    ...overrides,
  };
}

function setColor(color: "all" | "white" | "black") {
  useDossierStore.setState({
    filters: { ...DEFAULT_OVERVIEW_FILTERS, color },
    selectedOpening: null,
    selectedLine: null,
  });
}

function prepareButtons() {
  return screen.getAllByTestId("dossier-opening-card").map((card) => within(card).getByTestId("dossier-opening-prepare"));
}

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());
beforeEach(() => {
  openBoardPanel.mock.resetCalls();
  openExplorerPanel.mock.resetCalls();
  const state = useStudioStore.getState();
  const active = selectActiveBoard(state);
  useStudioStore.setState({
    workspaceView: "library",
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    importPlayerGame: realImportPlayerGame,
    flip: realFlip,
    boards: state.boards.map((board) =>
      board.id === active.id ? { ...board, orientation: "white" as const } : board,
    ),
  });
  setColor("all");
});

test("renders one card per opening for the filtered colour", () => {
  setColor("white");
  render(
    <DossierOpenings
      games={[
        game("i1"),
        game("i2", { playedAt: Date.UTC(2024, 2, 1) }),
        game("s1", { opening: "Sicilian Defense", eco: "B20", moves: "e4 c5" }),
        game("f1", { color: "black", opening: "French Defense", eco: "C00", moves: "e4 e6" }),
      ]}
    />,
  );
  const cards = screen.getAllByTestId("dossier-opening-card");
  assert.equal(cards.length, 2);
  assert.match(cards[0]!.textContent ?? "", /Italian Game/);
  assert.match(cards[1]!.textContent ?? "", /Sicilian Defense/);
  assert.equal(screen.queryByText("French Defense"), null);
  assert.ok(screen.getByText("Move-by-move lines"));
});

test("shows Brancas/Pretas tabs only when the dossier colour is all", () => {
  render(
    <DossierOpenings
      games={[game("i1"), game("f1", { color: "black", opening: "French Defense", moves: "e4 e6" })]}
    />,
  );
  const tabs = within(screen.getByTestId("dossier-openings-color-tabs"));
  assert.equal(tabs.getAllByRole("tab").length, 2);
  fireEvent.click(tabs.getByRole("tab", { name: "Black" }));
  const cards = screen.getAllByTestId("dossier-opening-card");
  assert.equal(cards.length, 1);
  assert.match(cards[0]!.textContent ?? "", /French Defense/);

  cleanup();
  setColor("white");
  render(<DossierOpenings games={[game("i1")]} />);
  assert.equal(screen.queryByTestId("dossier-openings-color-tabs"), null);
});

test("clicking a card toggles the dossier's opening selection", () => {
  setColor("white");
  render(<DossierOpenings games={[game("i1")]} />);
  const card = screen.getByTestId("dossier-opening-card");
  fireEvent.click(card);
  assert.equal(useDossierStore.getState().selectedOpening, "italian game");
  assert.deepEqual(useDossierStore.getState().selectedLine, ["e4", "e5", "Nf3"]);
  assert.equal(card.getAttribute("aria-pressed"), "true");

  fireEvent.click(card);
  assert.equal(useDossierStore.getState().selectedOpening, null);
  assert.equal(useDossierStore.getState().selectedLine, null);
  assert.equal(card.getAttribute("aria-pressed"), "false");
});

test("Prepare line opens the line for the user's side and switches to the Studio", () => {
  const importPlayerGame = mock.fn();
  const flip = mock.fn();
  useStudioStore.setState({ importPlayerGame: importPlayerGame as never, flip: flip as never });
  setColor("white");
  render(<DossierOpenings games={[game("i1")]} />);

  fireEvent.click(prepareButtons()[0]!);
  assert.equal(importPlayerGame.mock.callCount(), 1);
  const [imported, options] = importPlayerGame.mock.calls[0]!.arguments as [PlayerGame, unknown];
  assert.equal(imported.color, "black");
  assert.equal(imported.moves, "e4 e5 Nf3");
  assert.deepEqual(options, { openInNewBoard: true });
  assert.equal(flip.mock.callCount(), 1);
  assert.equal(openBoardPanel.mock.callCount(), 1);
  assert.equal(openExplorerPanel.mock.callCount(), 1);
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("Prepare line for a black opponent's line imports it as White", () => {
  const importPlayerGame = mock.fn();
  const flip = mock.fn();
  useStudioStore.setState({ importPlayerGame: importPlayerGame as never, flip: flip as never });
  setColor("black");
  render(
    <DossierOpenings
      games={[game("f1", { color: "black", opening: "French Defense", eco: "C00", moves: "e4 e6 d4" })]}
    />,
  );

  fireEvent.click(prepareButtons()[0]!);
  const [imported] = importPlayerGame.mock.calls[0]!.arguments as [PlayerGame, unknown];
  assert.equal(imported.color, "white");
  assert.equal(flip.mock.callCount(), 0);
  assert.equal(openBoardPanel.mock.callCount(), 1);
  assert.equal(openExplorerPanel.mock.callCount(), 1);
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("shows the empty state when no opening passes the filters", () => {
  setColor("white");
  render(<DossierOpenings games={[game("f1", { color: "black", opening: "French Defense" })]} />);
  assert.equal(screen.getByTestId("dossier-openings-empty").textContent, "No openings with these filters");
  assert.equal(screen.queryAllByTestId("dossier-opening-card").length, 0);
});

test("sort and min games follow the My Stats controls", () => {
  setColor("white");
  render(
    <DossierOpenings
      games={[
        game("i1", { playerResult: "loss" }),
        game("i2", { playerResult: "loss" }),
        game("i3", { playerResult: "loss" }),
        game("s1", { opening: "Sicilian Defense", eco: "B20", playerResult: "win" }),
      ]}
    />,
  );
  assert.match(screen.getAllByTestId("dossier-opening-card")[0]!.textContent ?? "", /Italian Game/);
  fireEvent.click(screen.getByRole("button", { name: "Score" }));
  assert.match(screen.getAllByTestId("dossier-opening-card")[0]!.textContent ?? "", /Sicilian Defense/);
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  assert.equal(screen.getAllByTestId("dossier-opening-card").length, 1);
  assert.match(screen.getAllByTestId("dossier-opening-card")[0]!.textContent ?? "", /Italian Game/);
  fireEvent.click(screen.getByRole("button", { name: "5" }));
  assert.ok(screen.getByTestId("dossier-openings-empty"));
});
