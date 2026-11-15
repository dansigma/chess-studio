// SIG-1344: the dossier's "Where they leave your repertoire" section — coverage
// summary, gap order and counts, the no-repertoire hint, and "Prepare line"
// opening the position before the gap move.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { PlayerGame } from "@/src/lib/player-types";
import type { BoardSession } from "@/src/store/slices/types";

const openBoardPanel = mock.fn();
const openExplorerPanel = mock.fn();
mock.module("../../dock-api", { namedExports: { openBoardPanel, openExplorerPanel, openStudioPanel: mock.fn() } });

const { DossierRepertoireGaps } = await import("./DossierRepertoireGaps.tsx");
const { importSans } = await import("@/src/chess/pgn.ts");
const { emptyBoard } = await import("@/src/store/slices/board-helpers.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

const realImportPlayerGame = useStudioStore.getState().importPlayerGame;
const realFlip = useStudioStore.getState().flip;

function tree(line: string) {
  const imported = importSans(line ? line.split(" ") : []);
  assert.equal(imported.warnings.length, 0, `fixture failed to import: ${imported.warnings}`);
  return imported.tree;
}

/** One neutral board plus the requested repertoire trees. */
function seed(lines: { white?: string; black?: string }) {
  const boards: BoardSession[] = [emptyBoard("Board", "board-main")];
  for (const color of ["white", "black"] as const) {
    const line = lines[color];
    if (line === undefined) {
      continue;
    }
    const board = emptyBoard(`Repertoire ${color}`, `rep-${color}`);
    boards.push({ ...board, repertoireColor: color, tree: tree(line) });
  }
  useStudioStore.setState({ boards, activeBoardId: "board-main" });
}

let counter = 0;

function game(moves: string, overrides: Partial<PlayerGame> = {}): PlayerGame {
  counter += 1;
  return {
    id: `g${counter}`,
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
    playedAt: Date.UTC(2024, 0, 1) + counter * 1000,
    moves,
    ...overrides,
  };
}

function gapRows() {
  return screen.queryAllByTestId("dossier-repertoire-gap");
}

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());
beforeEach(() => {
  counter = 0;
  openBoardPanel.mock.resetCalls();
  openExplorerPanel.mock.resetCalls();
  useStudioStore.setState({
    workspaceView: "library",
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    importPlayerGame: realImportPlayerGame,
    flip: realFlip,
  });
  seed({});
});

test("summarizes how many of the player's openings the repertoire covers", () => {
  seed({ black: "e4 e5 Nf3 Nc6" });
  render(
    <DossierRepertoireGaps
      opponentColor="white"
      games={[
        game("e4 e5 Nf3 Nc6", { opening: "Italian Game", eco: "C50" }),
        game("e4 c5 Nf3", { opening: "Sicilian Defense", eco: "B20" }),
      ]}
    />,
  );
  assert.equal(screen.getByTestId("dossier-repertoire-gaps-summary").textContent, "1 of 2 openings covered");
});

test("the summary counts only the openings the min-games filter keeps (SIG-1344 review)", () => {
  seed({ black: "e4 e5 Nf3 Nc6" });
  const italian = { opening: "Italian Game", eco: "C50" };
  render(
    <DossierRepertoireGaps
      opponentColor="white"
      minGames={3}
      games={[
        game("e4 e5 Nf3 Nc6", italian),
        game("e4 e5 Nf3 Nc6", italian),
        game("e4 e5 Nf3 Nc6", italian),
        game("e4 c5 Nf3", { opening: "Sicilian Defense", eco: "B20" }),
      ]}
    />,
  );
  // The single-game Sicilian is hidden from the cards, so it is not counted.
  assert.equal(screen.getByTestId("dossier-repertoire-gaps-summary").textContent, "1 of 1 opening covered");
});

test("lists gaps most frequent first with the player's game counts", () => {
  seed({ black: "e4 e5 Nf3" });
  render(
    <DossierRepertoireGaps
      opponentColor="white"
      games={[
        game("d4 d5", { opening: "Queen's Pawn" }),
        game("d4 d5", { opening: "Queen's Pawn" }),
        game("d4 d5", { opening: "Queen's Pawn" }),
        game("e4 e5 d4 exd4", { opening: "Italian Game" }),
        game("e4 e5 d4 exd4", { opening: "Italian Game" }),
        game("c4 e5", { opening: "English Opening" }),
      ]}
    />,
  );
  const rows = gapRows();
  assert.deepEqual(
    rows.map((row) => row.getAttribute("data-count")),
    ["3", "2", "1"],
  );
  assert.match(rows[0]!.textContent ?? "", /1\. d4/);
  assert.match(rows[0]!.textContent ?? "", /3 games/);
  assert.match(rows[1]!.textContent ?? "", /2\. d4/);
  assert.match(rows[1]!.textContent ?? "", /2 games/);
  assert.match(rows[2]!.textContent ?? "", /1\. c4/);
  assert.match(rows[2]!.textContent ?? "", /1 game/);
});

test("keeps at most ten gap moves", () => {
  seed({ black: "e4 e5" });
  const firstMoves = ["d4", "c4", "Nf3", "g3", "b3", "f4", "Nc3", "e3", "d3", "a3", "h3", "b4"];
  render(
    <DossierRepertoireGaps
      opponentColor="white"
      games={firstMoves.map((san, index) => game(san, { opening: `Opening ${index}` }))}
    />,
  );
  assert.equal(gapRows().length, 10);
});

test("follows the selected side instead of mixing both colours", () => {
  seed({ white: "e4 e5", black: "e4 e5 Nf3" });
  render(
    <DossierRepertoireGaps
      opponentColor="white"
      games={[
        game("d4 d5"),
        game("e4 c5", { color: "black", whiteName: "Other", blackName: "Player" }),
      ]}
    />,
  );
  const rows = gapRows();
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.textContent ?? "", /1\. d4/);
});

test("asks for a repertoire of the needed colour when none is marked", () => {
  render(<DossierRepertoireGaps opponentColor="white" games={[game("e4 e5 Nf3")]} />);
  assert.equal(
    screen.getByTestId("dossier-repertoire-gaps-no-repertoire").textContent,
    "Mark a board as your Black repertoire to see the coverage",
  );
  assert.equal(screen.queryByTestId("dossier-repertoire-gaps-summary"), null);
  assert.equal(gapRows().length, 0);

  cleanup();
  render(
    <DossierRepertoireGaps
      opponentColor="black"
      games={[game("e4 e5 Nf3", { color: "black", whiteName: "Other", blackName: "Player" })]}
    />,
  );
  assert.equal(
    screen.getByTestId("dossier-repertoire-gaps-no-repertoire").textContent,
    "Mark a board as your White repertoire to see the coverage",
  );
});

test("shows the Portuguese no-repertoire hint", () => {
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });
  render(<DossierRepertoireGaps opponentColor="white" games={[game("e4 e5 Nf3")]} />);
  assert.equal(
    screen.getByTestId("dossier-repertoire-gaps-no-repertoire").textContent,
    "Marque um tabuleiro como repertório de Pretas para ver a cobertura",
  );
});

test("Prepare line opens the position before the gap move, oriented to the user", () => {
  seed({ black: "e4 e5 Nf3" });
  const importPlayerGame = mock.fn();
  const flip = mock.fn();
  useStudioStore.setState({ importPlayerGame: importPlayerGame as never, flip: flip as never });
  render(
    <DossierRepertoireGaps
      opponentColor="white"
      games={[game("e4 e5 d4 exd4"), game("e4 e5 d4 Nf6")]}
    />,
  );

  const row = gapRows()[0]!;
  assert.match(row.textContent ?? "", /2\. d4/);
  fireEvent.click(within(row).getByTestId("dossier-repertoire-gap-prepare"));

  assert.equal(importPlayerGame.mock.callCount(), 1);
  const [imported, options] = importPlayerGame.mock.calls[0]!.arguments as [PlayerGame, unknown];
  assert.equal(imported.moves, "e4 e5");
  assert.equal(imported.color, "black");
  assert.deepEqual(options, { openInNewBoard: true, title: "Preparation line · 1. e4 e5" });
  assert.equal(flip.mock.callCount(), 1);
  assert.equal(openBoardPanel.mock.callCount(), 1);
  assert.equal(openExplorerPanel.mock.callCount(), 1);
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("Prepare line for a first-move gap opens the start position", () => {
  seed({ black: "e4 e5 Nf3" });
  const importPlayerGame = mock.fn();
  const flip = mock.fn();
  useStudioStore.setState({ importPlayerGame: importPlayerGame as never, flip: flip as never });
  render(<DossierRepertoireGaps opponentColor="white" games={[game("d4 d5")]} />);

  fireEvent.click(screen.getByTestId("dossier-repertoire-gap-prepare"));
  assert.equal(importPlayerGame.mock.callCount(), 1);
  const [imported] = importPlayerGame.mock.calls[0]!.arguments as [PlayerGame, unknown];
  assert.equal(imported.moves, "");
  assert.equal(imported.color, "black");
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("recomputes the summary and gaps when the repertoire tree changes", () => {
  seed({ black: "e4 e5 Nf3 Nc6 d4" });
  render(<DossierRepertoireGaps opponentColor="white" games={[game("e4 e5 Nf3 Nc6 d4")]} />);
  assert.equal(screen.getByTestId("dossier-repertoire-gaps-summary").textContent, "1 of 1 opening covered");
  assert.equal(gapRows().length, 0);

  act(() => seed({ black: "e4 e5 Nf3 Nc6 Bb5" }));
  assert.equal(screen.getByTestId("dossier-repertoire-gaps-summary").textContent, "0 of 1 opening covered");
  const rows = gapRows();
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.textContent ?? "", /3\. d4/);
  assert.match(rows[0]!.textContent ?? "", /1 game/);
});
