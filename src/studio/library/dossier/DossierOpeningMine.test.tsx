// SIG-1345: each dossier opening card shows the user's own results in that
// line, the signed-out/error notice above the list, one shared load for every
// card, and the "Train" action.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../../../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen, waitFor, within, act } from "@testing-library/react";
import type { LoadCappedMyGamesResult } from "@/src/lib/my-games/load-games";
import type { PlayerGame } from "@/src/lib/player-types";
import type { DossierOpeningRow } from "@/src/lib/prep/dossier-openings";

let loadImpl: () => Promise<LoadCappedMyGamesResult> = async () => ({
  ok: true,
  games: [],
  cancelled: false,
});

const loadCappedMyGames = mock.fn(async (): Promise<LoadCappedMyGamesResult> => loadImpl());
mock.module("@/src/lib/my-games/load-games", { namedExports: { loadCappedMyGames } });
mock.module("@/src/lib/supabase/client", {
  namedExports: { createBrowserSupabase: () => ({}) },
});

const openBoardPanel = mock.fn();
const openExplorerPanel = mock.fn();
const openStudioPanel = mock.fn();
mock.module("../../dock-api", { namedExports: { openBoardPanel, openExplorerPanel, openStudioPanel } });

const { DossierOpeningMine } = await import("./DossierOpeningMine.tsx");
const { DossierOpeningsNotice } = await import("./DossierOpeningsNotice.tsx");
const { DossierOpenings } = await import("./DossierOpenings.tsx");
const { resetMyGamesForDossier } = await import("./use-my-games-for-dossier.ts");
const { useDossierStore } = await import("./dossier-store.ts");
const { useStudioStore, selectActiveBoard } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { DEFAULT_OVERVIEW_FILTERS } = await import("@/src/lib/my-games/overview-filters.ts");

const ROW: DossierOpeningRow = {
  key: "italian game",
  eco: "C50",
  opening: "Italian Game",
  games: 6,
  sharePct: 60,
  wins: 2,
  draws: 0,
  losses: 4,
  scorePct: 33,
  lastYear: 2024,
  line: ["e4", "e5", "Nf3"],
};

function game(id: string, overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id,
    winner: null,
    whiteName: "User",
    whiteRating: null,
    blackName: "Other",
    blackRating: null,
    year: 2024,
    month: 1,
    event: null,
    eco: null,
    opening: "Italian Game",
    color: "black",
    playerResult: "loss",
    playedAt: Date.UTC(2024, 0, 1),
    moves: "e4 e5 Nf3",
    ...overrides,
  };
}

/** Six Black games in the row's line: 2 wins (33%), one reviewed at 71/4. */
function sixOwnGames(): PlayerGame[] {
  return [0, 1, 2, 3, 4, 5].map((index) =>
    game(`own-${index}`, {
      playerResult: index < 2 ? "win" : "loss",
      ...(index === 0
        ? {
            reviewedAt: "2024-01-02",
            userAccuracy: 71,
            mistakeCounts: {
              opening: { inaccuracy: 1, mistake: 2, miss: 1, blunder: 0 },
              middlegame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 9 },
              endgame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 9 },
            },
          }
        : {}),
    }),
  );
}

function setUser(signedIn: boolean): void {
  useStudioStore.setState({ user: signedIn ? ({ id: "u1" } as never) : null });
}

function setColor(color: "all" | "white" | "black"): void {
  useDossierStore.setState({
    filters: { ...DEFAULT_OVERVIEW_FILTERS, color },
    selectedOpening: null,
    selectedLine: null,
  });
}

before(() => setupDom());
after(() => teardownDom());
beforeEach(() => {
  loadImpl = async () => ({ ok: true, games: [], cancelled: false });
  loadCappedMyGames.mock.resetCalls();
  openBoardPanel.mock.resetCalls();
  openExplorerPanel.mock.resetCalls();
  openStudioPanel.mock.resetCalls();
  const state = useStudioStore.getState();
  const active = selectActiveBoard(state);
  useStudioStore.setState({
    workspaceView: "library",
    training: false,
    trainingStart: null,
    statusMessage: null,
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    boards: state.boards.map((board) =>
      board.id === active.id ? { ...board, orientation: "white" as const } : board,
    ),
  });
  setUser(true);
  setColor("white");
});
afterEach(() => {
  cleanup();
  resetMyGamesForDossier();
});

test("shows the user's games, score, accuracy and opening mistakes for the inverted colour", async () => {
  loadImpl = async () => ({ ok: true, games: sixOwnGames(), cancelled: false });
  render(<DossierOpeningMine row={ROW} opponentColor="white" />);

  const stats = await screen.findByTestId("dossier-own-line");
  assert.equal(
    stats.textContent,
    "You: 6 games · 33% · accuracy 71 · 4 opening mistakes",
  );
  assert.equal(stats.getAttribute("title"), "Your Black games in this move sequence");
});

test("shows no numbers when the user has no games in the line", async () => {
  render(<DossierOpeningMine row={ROW} opponentColor="white" />);

  const none = await screen.findByTestId("dossier-own-line-none");
  assert.equal(none.textContent, "No games of yours in this line");
  assert.equal(none.textContent?.includes("%"), false);
  assert.ok(screen.getByTestId("dossier-opening-train"));
});

test("drops the word labels on a narrow dossier but keeps the values", async () => {
  loadImpl = async () => ({ ok: true, games: sixOwnGames(), cancelled: false });
  render(<DossierOpeningMine row={ROW} opponentColor="white" />);

  const stats = await screen.findByTestId("dossier-own-line");
  const labels = within(stats).getAllByTestId("dossier-own-line-label");
  assert.equal(labels.length, 4);
  for (const label of labels) {
    assert.match(label.className, /\bhidden\b/);
    assert.match(label.className, /@min-\[900px\]:inline/);
  }
  // The values are outside the hideable labels, so they survive the compact form.
  const values = stats.textContent ?? "";
  for (const value of ["6", "33%", "71", "4"]) {
    assert.ok(values.includes(value));
    assert.equal(labels.some((label) => label.textContent?.includes(value)), false);
  }
});

test("shows the sign-in line above the cards and leaves both actions available", async () => {
  setUser(false);
  render(
    <DossierOpenings
      games={[
        game("p1", { color: "white", playerResult: "win", moves: "e4 e5 Nf3" }),
        game("p2", { color: "white", playerResult: "win", eco: "B20", opening: "Sicilian Defense", moves: "e4 c5" }),
      ]}
    />,
  );

  assert.ok(await screen.findByTestId("dossier-own-games-signin"));
  assert.equal(loadCappedMyGames.mock.callCount(), 0);
  const cards = screen.getAllByTestId("dossier-opening-card");
  assert.equal(cards.length, 2);
  for (const card of cards) {
    assert.equal(within(card).queryByTestId("dossier-own-line"), null);
    assert.equal(within(card).queryByTestId("dossier-own-line-none"), null);
    assert.ok(within(card).getByTestId("dossier-opening-prepare"));
    assert.ok(within(card).getByTestId("dossier-opening-train"));
  }
});

test("loads the user's games once for many cards and keeps Prepare with no games", async () => {
  render(
    <DossierOpenings
      games={[
        game("p1", { color: "white", playerResult: "win", moves: "e4 e5 Nf3" }),
        game("p2", { color: "white", playerResult: "win", eco: "B20", opening: "Sicilian Defense", moves: "e4 c5" }),
      ]}
    />,
  );

  await waitFor(() => assert.equal(screen.getAllByTestId("dossier-own-line-none").length, 2));
  assert.equal(loadCappedMyGames.mock.callCount(), 1);
  const cards = screen.getAllByTestId("dossier-opening-card");
  for (const card of cards) {
    assert.ok(within(card).getByTestId("dossier-opening-prepare"));
    assert.ok(within(card).getByTestId("dossier-opening-train"));
  }
});

test("the notice shows the load error and retries into the cards", async () => {
  let attempts = 0;
  loadImpl = async () => {
    attempts += 1;
    if (attempts === 1) {
      return { ok: false, error: "unavailable" };
    }
    return { ok: true, games: sixOwnGames(), cancelled: false };
  };
  render(
    <>
      <DossierOpeningsNotice />
      <DossierOpeningMine row={ROW} opponentColor="white" />
    </>,
  );

  assert.ok(await screen.findByTestId("dossier-own-games-error"));
  assert.equal(screen.queryByTestId("dossier-own-line"), null);
  assert.equal(screen.queryByTestId("dossier-own-line-none"), null);
  assert.equal(loadCappedMyGames.mock.callCount(), 1);

  await act(async () => {
    fireEvent.click(screen.getByTestId("dossier-own-games-retry"));
  });
  assert.ok(await screen.findByTestId("dossier-own-line"));
  assert.equal(screen.queryByTestId("dossier-own-games-error"), null);
  assert.equal(loadCappedMyGames.mock.callCount(), 2);
});

test("Train opens the line on the user's side and starts training from the first move", async () => {
  loadImpl = async () => ({ ok: true, games: [], cancelled: false });
  // Put the active board mid-line: an import without an explicit FEN would
  // otherwise land there because the FEN matches a node of the trained line.
  useStudioStore.setState({
    settings: { ...DEFAULT_SETTINGS, locale: "en", gamePreviewEnabled: false },
  });
  useStudioStore.getState().openListedGame({ title: "Setup", moves: "e4 e5 Nf3" });
  useStudioStore.getState().goPath([0, 0]);
  assert.deepEqual(selectActiveBoard(useStudioStore.getState()).path, [0, 0]);

  render(<DossierOpeningMine row={ROW} opponentColor="white" />);
  assert.ok(await screen.findByTestId("dossier-own-line-none"));

  fireEvent.click(screen.getByTestId("dossier-opening-train"));

  const state = useStudioStore.getState();
  const active = selectActiveBoard(state);
  assert.equal(active.tree.children[0]?.san, "e4");
  assert.deepEqual(active.path, []);
  assert.equal(active.orientation, "black");
  assert.equal(state.training, true);
  assert.deepEqual(state.trainingStart, []);
  assert.equal(state.workspaceView, "studio");
  assert.equal(openBoardPanel.mock.callCount(), 1);
  assert.equal(openExplorerPanel.mock.callCount(), 0);
  // The training UI is in the Repertoire panel; it must come to the front.
  assert.equal(openStudioPanel.mock.callCount(), 1);
  assert.deepEqual(openStudioPanel.mock.calls[0]!.arguments, ["repertoire"]);
});
