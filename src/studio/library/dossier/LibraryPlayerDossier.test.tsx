// SIG-1338: Library player dossier frame (header, filters, cards, areas).
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { PlayerGame, PlayerHit } from "@/src/lib/player-types";
import type { PlayerGamesState } from "../use-player-games";

let state: PlayerGamesState;
let retryCalls = 0;

mock.module("@/src/studio/library/use-player-games", {
  namedExports: {
    usePlayerGames: () => state,
  },
});

const { LibraryPlayerDossier, playerYearRange } = await import("./LibraryPlayerDossier.tsx");
const { useDossierStore } = await import("./dossier-store.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { DEFAULT_OVERVIEW_FILTERS } = await import("@/src/lib/my-games/overview-filters.ts");

const HIT: PlayerHit = { id: "lichess:magnus", source: "lichess", username: "magnus", displayName: "Magnus", subtitle: "2800 blitz" };
const DAY = 86_400_000;

function game(id: string, overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id,
    winner: null,
    whiteName: "Magnus",
    whiteRating: null,
    blackName: "Other",
    blackRating: null,
    year: 2026,
    month: 10,
    event: null,
    eco: null,
    opening: "Italian Game",
    color: "white",
    playerResult: "win",
    playedAt: Date.now() - DAY,
    timeClass: "blitz",
    ...overrides,
  };
}

function gamesState(overrides: Partial<PlayerGamesState> = {}): PlayerGamesState {
  return {
    games: [],
    loading: false,
    error: null,
    noGames: false,
    truncated: false,
    partial: false,
    notice: null,
    fromLoadedFiles: false,
    retry: () => {
      retryCalls += 1;
    },
    ...overrides,
  };
}

function open() {
  useDossierStore.getState().openPlayer(HIT);
  return render(<LibraryPlayerDossier />);
}

before(() => setupDom());
after(() => teardownDom());
beforeEach(() => {
  retryCalls = 0;
  state = gamesState();
  useStudioStore.setState({
    workspaceView: "library",
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    playerProfile: null,
    playerColorFilter: "all",
  });
  useDossierStore.setState({
    player: null,
    filters: DEFAULT_OVERVIEW_FILTERS,
    selectedLine: null,
    selectedOpening: null,
  });
});
afterEach(() => cleanup());

test("shows a hint until a player is selected", () => {
  render(<LibraryPlayerDossier />);
  assert.ok(screen.getByTestId("library-player-dossier-hint"));
  assert.match(screen.getByTestId("library-player-dossier-hint").textContent ?? "", /Search for a player/);
});

test("loading is shown inside the dossier under the header", () => {
  state = gamesState({ loading: true });
  open();
  assert.equal(screen.getByTestId("dossier-player-name").textContent, "Magnus");
  assert.equal(screen.getByTestId("dossier-player-meta").textContent, "Lichess · 0 games");
  assert.equal(screen.getByRole("status").textContent, "Loading games");
});

test("error offers retry inside the dossier", () => {
  state = gamesState({ error: "boom" });
  open();
  const alert = screen.getByRole("alert");
  assert.match(alert.textContent ?? "", /Could not load this player's games: boom/);
  fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
  assert.equal(retryCalls, 1);
});

test("no games found is shown inside the dossier", () => {
  state = gamesState({ noGames: true });
  open();
  assert.equal(screen.getByRole("status").textContent, "No games found for this player.");
});

test("the partial-result notice is shown inside the dossier", () => {
  state = gamesState({ games: [game("g1")], partial: true });
  open();
  assert.match(screen.getByTestId("dossier-partial").textContent ?? "", /may be incomplete/);

  cleanup();
  state = gamesState({ games: [game("g1")], notice: "Some months were skipped." });
  open();
  assert.equal(screen.getByTestId("dossier-partial").textContent, "Some months were skipped.");
});

test("Ritmo is hidden when no game has a time class", () => {
  state = gamesState({ games: [game("g1", { timeClass: null })] });
  open();
  // Scope to the dossier filter bar: the move-by-move tree keeps its own
  // "Time control" filter (SIG-1341).
  const filterBar = within(screen.getByRole("group", { name: "Overview" }));
  assert.equal(filterBar.queryByLabelText("Time control"), null);
  assert.ok(filterBar.getByLabelText("Period"));

  cleanup();
  state = gamesState({ games: [game("g1", { timeClass: "rapid" })] });
  open();
  const filterBarWithTimeClasses = within(screen.getByRole("group", { name: "Overview" }));
  assert.ok(filterBarWithTimeClasses.getByLabelText("Time control"));
});

test("cards follow the filters, omit accuracy and sit above the two areas", () => {
  state = gamesState({
    games: [
      game("w1", { year: 2026, playedAt: Date.now() - DAY }),
      game("w2", { year: 2026, playedAt: Date.now() - 2 * DAY }),
      game("b1", {
        year: 2025,
        playedAt: Date.now() - 400 * DAY,
        color: "black",
        playerResult: "loss",
        timeClass: "rapid",
      }),
    ],
  });
  open();
  assert.equal(screen.getByTestId("dossier-player-meta").textContent, "Lichess · 3 games · 2025–2026");
  assert.equal(screen.getByTestId("kpi-games").textContent, "3");
  assert.equal(screen.getByTestId("kpi-score").textContent, "67%");
  assert.equal(screen.queryByTestId("kpi-accuracy"), null);
  assert.ok(screen.getByTestId("dossier-openings"));
  assert.ok(screen.getByTestId("dossier-games"));
  assert.equal(screen.getAllByTestId("dossier-opening-card").length, 1);
  assert.match(screen.getAllByTestId("dossier-opening-card")[0]!.textContent ?? "", /Italian Game/);
  assert.equal(screen.getAllByTestId("dossier-game-row").length, 3);
  assert.ok(screen.getByTestId("dossier-openings").parentElement?.className.includes("@min-[720px]:grid-cols-2"));
  // SIG-1405: the top colour bar is the only colour control; with "all" the
  // openings pick a side and say so instead of rendering their own tabs.
  assert.equal(screen.queryByTestId("dossier-openings-color-tabs"), null);
  assert.match(screen.getByTestId("dossier-openings-side").textContent ?? "", /Showing White openings/);

  fireEvent.click(screen.getByRole("button", { name: "White" }));
  assert.equal(screen.getByTestId("kpi-games").textContent, "2");
  assert.equal(screen.getByTestId("kpi-score").textContent, "100%");
  assert.equal(screen.getAllByTestId("dossier-game-row").length, 2);
  assert.equal(screen.queryByTestId("dossier-openings-side"), null);
});

test("Open in Studio runs the online-player flow with the filters' colour", () => {
  state = gamesState({ games: [game("g1")] });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Black" }));
  fireEvent.click(screen.getByRole("button", { name: "Open in Studio" }));
  assert.equal(useStudioStore.getState().playerProfile?.id, HIT.id);
  assert.equal(useStudioStore.getState().playerColorFilter, "black");
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("playerYearRange takes the first and last dated year", () => {
  assert.deepEqual(playerYearRange([]), null);
  assert.deepEqual(playerYearRange([game("a", { year: 2020 }), game("b", { year: 2018 })]), [2018, 2020]);
  assert.deepEqual(playerYearRange([game("c", { year: null, playedAt: Date.UTC(2021, 5, 1) })]), [2021, 2021]);
  assert.deepEqual(playerYearRange([game("d", { year: null, playedAt: null })]), null);
});

test("a local player keeps a path to the Games tab; online players have none", async () => {
  const { useLibraryStore } = await import("../library-store.ts");
  state = gamesState({ games: [game("g1")] });
  open();
  assert.equal(screen.queryByRole("button", { name: "View in Games tab" }), null);
  cleanup();

  const local: PlayerHit = {
    id: "studio:Local Player",
    source: "studio",
    username: "Local Player",
    displayName: "Local Player",
    subtitle: "Studio database",
    inDatabases: true,
  };
  state = gamesState({ games: [game("g1")], fromLoadedFiles: true });
  useLibraryStore.setState({ mode: "players" });
  useDossierStore.getState().openPlayer(local, "black");
  render(<LibraryPlayerDossier />);
  // SIG-1405: the Studio cannot load a local-only player, so its handoff is
  // absent and the Games tab is the only route.
  assert.equal(screen.queryByRole("button", { name: "Open in Studio" }), null);
  fireEvent.click(screen.getByRole("button", { name: "View in Games tab" }));
  const library = useLibraryStore.getState();
  assert.equal(library.mode, "games");
  assert.equal(library.filters.player, "Local Player");
  assert.equal(library.filters.playerColor, "black");
});

test("a studio player whose games come from the server keeps Open in Studio", () => {
  // Server Studio hits and players restored from the URL carry `inDatabases`
  // too; the handoff follows where the games were loaded from instead.
  state = gamesState({ games: [game("g1")], fromLoadedFiles: false });
  useDossierStore.getState().openPlayer({
    id: "studio:Sample Player",
    source: "studio",
    username: "Sample Player",
    displayName: "Sample Player",
    subtitle: "",
    inDatabases: true,
  });
  render(<LibraryPlayerDossier />);
  assert.ok(screen.getByRole("button", { name: "Open in Studio" }));
  assert.equal(screen.queryByRole("button", { name: "View in Games tab" }), null);
});
