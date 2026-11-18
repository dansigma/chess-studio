// SIG-1342: the dossier's games list, opening filter and inline Library preview.
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { PlayerGame, PlayerHit } from "@/src/lib/player-types";
import { DOSSIER_GAMES_PAGE, DossierGames } from "./DossierGames.tsx";
import { useDossierStore } from "./dossier-store.ts";
import { openingGroupKey } from "@/src/lib/prep/opening-group.ts";
import { useStudioStore } from "@/src/store/studio-store.ts";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings.ts";

const HIT: PlayerHit = {
  id: "lichess:magnus",
  source: "lichess",
  username: "magnus",
  displayName: "Magnus",
  subtitle: "2800 blitz",
};

const OPEN_LISTED_GAME = useStudioStore.getState().openListedGame;
const SET_WORKSPACE_VIEW = useStudioStore.getState().setWorkspaceView;

function game(id: string, overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id,
    winner: "white",
    whiteName: "Magnus",
    whiteRating: 2800,
    blackName: "Other",
    blackRating: 2700,
    year: 2026,
    month: 1,
    event: `Event ${id}`,
    eco: "C50",
    opening: "Italian Game",
    color: "white",
    playerResult: "win",
    playedAt: Date.UTC(2026, 0, 1),
    moves: "e4 e5 Nf3 Nc6 Bb5",
    ...overrides,
  };
}

function rows() {
  return screen.queryAllByTestId("dossier-game-row");
}

function previewOrientation(): string | null {
  return screen.getByTestId("library-preview").getAttribute("data-orientation");
}

function setActiveOrientation(orientation: "white" | "black") {
  useStudioStore.setState((state) => ({
    boards: state.boards.map((board) => ({ ...board, orientation })),
  }));
}

before(() => setupDom());
after(() => teardownDom());

beforeEach(() => {
  useStudioStore.setState({
    workspaceView: "library",
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
  });
  useDossierStore.setState({
    player: HIT,
    selectedOpening: null,
    selectedLine: null,
  });
});

afterEach(() => {
  cleanup();
  useStudioStore.setState({ openListedGame: OPEN_LISTED_GAME, setWorkspaceView: SET_WORKSPACE_VIEW });
  useDossierStore.setState({ player: null, selectedOpening: null, selectedLine: null });
});

test("lists games newest first, undated last, with both players, result, ECO, year and event", () => {
  render(
    <DossierGames
      games={[
        game("old", { playedAt: Date.UTC(2025, 0, 1) }),
        game("undated", { playedAt: null, year: null }),
        game("new", { playedAt: Date.UTC(2026, 5, 1), event: "Candidates" }),
      ]}
    />,
  );

  const list = rows();
  assert.equal(list.length, 3);
  assert.match(list[0]!.textContent ?? "", /Candidates/);
  assert.match(list[1]!.textContent ?? "", /Event old/);
  assert.match(list[2]!.textContent ?? "", /Event undated/);
  assert.match(list[0]!.textContent ?? "", /Magnus/);
  assert.match(list[0]!.textContent ?? "", /2800/);
  assert.match(list[0]!.textContent ?? "", /Other/);
  assert.match(list[0]!.textContent ?? "", /2700/);
  assert.match(list[0]!.textContent ?? "", /1-0/);
  assert.match(list[0]!.textContent ?? "", /C50/);
  assert.match(list[0]!.textContent ?? "", /2026/);
  assert.equal(list[2]!.textContent?.includes("—"), true);
});

test("an opening selection filters the list and its chip clears the filter", () => {
  const games = [
    game("italian", { opening: "Italian Game" }),
    game("sicilian", { opening: "Sicilian Defence", eco: "B20" }),
  ];
  useDossierStore.setState({ selectedOpening: "italian game", selectedLine: ["e4", "e5"] });
  const { rerender } = render(<DossierGames games={games} />);

  assert.equal(rows().length, 1);
  assert.match(rows()[0]!.textContent ?? "", /C50/);
  const chip = screen.getByTestId("dossier-opening-chip");
  assert.match(chip.textContent ?? "", /Italian Game/);

  fireEvent.click(within(chip).getByRole("button", { name: "Remove opening filter Italian Game" }));
  assert.equal(useDossierStore.getState().selectedOpening, null);
  assert.equal(useDossierStore.getState().selectedLine, null);
  rerender(<DossierGames games={games} />);
  assert.equal(rows().length, 2);
  assert.equal(screen.queryByTestId("dossier-opening-chip"), null);
});

test("the chip names the opening by its ECO when the game has no opening name", () => {
  useDossierStore.setState({ selectedOpening: "B20", selectedLine: [] });
  render(<DossierGames games={[game("eco", { opening: null, eco: "B20" })]} />);
  assert.match(screen.getByTestId("dossier-opening-chip").textContent ?? "", /B20/);
});

test("a filter that hides the selected game drops the selection for good", () => {
  const games = [
    game("italian", { opening: "Italian Game", playedAt: Date.UTC(2026, 1, 1) }),
    game("sicilian", { opening: "Sicilian Defence", playedAt: Date.UTC(2026, 0, 1) }),
  ];
  render(<DossierGames games={games} />);
  fireEvent.click(rows()[0]!);
  assert.equal(rows()[0]!.getAttribute("aria-selected"), "true");
  assert.ok(screen.getByTestId("library-preview"));

  act(() => useDossierStore.setState({ selectedOpening: "sicilian defence", selectedLine: ["e4", "c5"] }));
  assert.equal(screen.queryByTestId("library-preview"), null);
  assert.equal(rows().length, 1);

  act(() => useDossierStore.setState({ selectedOpening: null, selectedLine: null }));
  assert.equal(rows().length, 2);
  assert.equal(screen.queryByTestId("library-preview"), null);
});

test("selecting a row shows the preview oriented to the dossier player's colour", () => {
  setActiveOrientation("black");
  render(
    <DossierGames
      games={[
        game("white-game", { color: "white", playedAt: Date.UTC(2026, 1, 1) }),
        game("black-game", { color: "black", playedAt: Date.UTC(2026, 0, 1), winner: "black" }),
      ]}
    />,
  );

  fireEvent.click(rows()[0]!);
  assert.equal(previewOrientation(), "white");
  assert.match(screen.getByTestId("library-preview-header").textContent ?? "", /Magnus/);
  assert.match(screen.getByTestId("library-preview-header").textContent ?? "", /Other/);

  fireEvent.click(rows()[1]!);
  assert.equal(previewOrientation(), "black");
});

test("ArrowDown selects and Enter opens the selected game in the Studio", () => {
  const opened: Array<{ title: string; pgn?: string; atFen?: string }> = [];
  const views: string[] = [];
  const revealed: Array<string | undefined> = [];
  const realScrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, arg?: boolean | ScrollIntoViewOptions) {
    revealed.push(this.id);
    assert.deepEqual(arg, { block: "nearest" });
  };
  useStudioStore.setState({
    openListedGame: (args) => {
      opened.push(args);
      OPEN_LISTED_GAME(args);
    },
    setWorkspaceView: (view) => {
      views.push(view);
      SET_WORKSPACE_VIEW(view);
    },
  });
  try {
    render(
      <DossierGames
        games={[
          game("older", { playedAt: Date.UTC(2025, 0, 1) }),
          game("newer", { playedAt: Date.UTC(2026, 0, 1) }),
        ]}
      />,
    );

    const list = screen.getByTestId("dossier-games-scroll");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    assert.equal(rows()[0]!.getAttribute("aria-selected"), "true");

    fireEvent.keyDown(list, { key: "ArrowDown" });
    assert.equal(rows()[1]!.getAttribute("aria-selected"), "true");
    assert.equal(rows()[0]!.getAttribute("aria-selected"), "false");
    // SIG-1405: the dossier is the only scroller; each step reveals its row
    // there instead of scrolling an inner box.
    assert.deepEqual(revealed, [rows()[0]!.id, rows()[1]!.id]);

    fireEvent.keyDown(list, { key: "Enter" });
    assert.equal(opened.length, 1);
    assert.equal(opened[0]!.title, "Magnus vs Other");
    assert.match(opened[0]!.pgn ?? "", /1\. e4 e5 2\. Nf3 Nc6 3\. Bb5 1-0/);
    assert.deepEqual(views, ["studio"]);
  } finally {
    HTMLElement.prototype.scrollIntoView = realScrollIntoView;
  }
});

test("the games list sizes to its content instead of opening a second scrollbar", () => {
  render(<DossierGames games={[game("a"), game("b")]} />);
  const list = screen.getByTestId("dossier-games-scroll");
  assert.equal(list.style.maxHeight, "");
  assert.equal(list.style.overflow, "");
  assert.doesNotMatch(list.className, /overflow-(auto|scroll|y)/);
});

test("long lists render in pages that follow the dossier scroll", () => {
  const games = Array.from({ length: 60 }, (_, index) =>
    game(`g${index}`, { playedAt: Date.UTC(2026, 0, 1) - index * 86_400_000 }),
  );
  render(<DossierGames games={games} />);
  assert.equal(rows().length, DOSSIER_GAMES_PAGE);
  assert.match(screen.getByTestId("dossier-games-more").textContent ?? "", /Load more \(35\)/);

  fireEvent.click(screen.getByTestId("dossier-games-more"));
  assert.equal(rows().length, DOSSIER_GAMES_PAGE * 2);
  fireEvent.click(screen.getByTestId("dossier-games-more"));
  assert.equal(rows().length, 60);
  assert.equal(screen.queryByTestId("dossier-games-more"), null);
});

test("ArrowDown past the last shown row reveals the next game", () => {
  const games = Array.from({ length: DOSSIER_GAMES_PAGE + 5 }, (_, index) =>
    game(`g${index}`, { playedAt: Date.UTC(2026, 0, 1) - index * 86_400_000 }),
  );
  render(<DossierGames games={games} />);
  const list = screen.getByTestId("dossier-games-scroll");
  fireEvent.click(rows()[DOSSIER_GAMES_PAGE - 1]!);
  fireEvent.keyDown(list, { key: "ArrowDown" });
  assert.equal(rows().length, DOSSIER_GAMES_PAGE + 1);
  assert.equal(rows()[DOSSIER_GAMES_PAGE]!.getAttribute("aria-selected"), "true");
});

test("End stops at the last shown row instead of rendering the whole list", () => {
  const games = Array.from({ length: 500 }, (_, index) =>
    game(`g${index}`, { playedAt: Date.UTC(2026, 0, 1) - index * 86_400_000 }),
  );
  render(<DossierGames games={games} />);
  const list = screen.getByTestId("dossier-games-scroll");
  fireEvent.keyDown(list, { key: "End" });
  assert.equal(rows().length, DOSSIER_GAMES_PAGE);
  assert.equal(rows()[DOSSIER_GAMES_PAGE - 1]!.getAttribute("aria-selected"), "true");
});

test("a deep selection kept after clearing the opening chip does not expand the list", () => {
  // 300 Italian games, then 10 Sicilian ones (older, so they sort last).
  const games = [
    ...Array.from({ length: 300 }, (_, index) =>
      game(`i${index}`, { playedAt: Date.UTC(2026, 0, 1) - index * 86_400_000 }),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      game(`s${index}`, {
        eco: "B20",
        opening: "Sicilian Defense",
        moves: "e4 c5",
        playedAt: Date.UTC(2020, 0, 1) - index * 86_400_000,
      }),
    ),
  ];
  // Narrow to the Sicilian through the store, the way the openings list does,
  // and select its 6th game (index 305 in the full list).
  useDossierStore.setState({ selectedOpening: openingGroupKey(games[300]!), selectedLine: [] });
  render(<DossierGames games={games} />);
  fireEvent.click(rows()[5]!);
  assert.ok(screen.getByTestId("library-preview"));

  act(() => useDossierStore.setState({ selectedOpening: null, selectedLine: null }));
  assert.equal(rows().length, DOSSIER_GAMES_PAGE);
  assert.equal(screen.queryByTestId("library-preview"), null);
});

test("a moves-only game builds a playable PGN for the preview", () => {
  render(<DossierGames games={[game("moves-only", { pgn: undefined })]} />);
  fireEvent.click(rows()[0]!);

  assert.ok(screen.getByText("3 moves"));
  fireEvent.click(screen.getByLabelText("Next move"));
  assert.equal(document.querySelector('[aria-current="step"]')?.textContent ?? "", "e4");
  fireEvent.click(screen.getByText("Open in Studio"));
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("an empty result says no games match these filters", () => {
  render(<DossierGames games={[]} />);
  const empty = screen.getByTestId("dossier-games-empty");
  assert.equal(empty.textContent, "No games with these filters");
  assert.equal(rows().length, 0);
  assert.equal(screen.queryByTestId("library-preview"), null);
});

test("an opening filter with no games also shows the empty state and keeps the chip", () => {
  useDossierStore.setState({ selectedOpening: "nothing", selectedLine: [] });
  render(<DossierGames games={[game("italian")]} />);
  assert.equal(screen.getByTestId("dossier-games-empty").textContent, "No games with these filters");
  assert.match(screen.getByTestId("dossier-opening-chip").textContent ?? "", /nothing/);
});
