// SIG-1346: the Library's open player dossier is part of the URL, so a reload,
// a shared link and the browser's Back/Forward buttons all land on it.
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, render } from "@testing-library/react";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";

const { useWorkspaceViewUrl } = await import("./use-workspace-view-url.ts");
const { parseLibraryPlayer, withLibraryPlayer } = await import("./workspace-view-url.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { useLibraryStore } = await import("./library/library-store.ts");
const { useDossierStore } = await import("./library/dossier/dossier-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { DEFAULT_OVERVIEW_FILTERS } = await import("@/src/lib/my-games/overview-filters.ts");

const LICHESS: PlayerHit = {
  id: "lichess:magnus",
  source: "lichess",
  username: "magnus",
  displayName: "Magnus Carlsen",
  subtitle: "2800 blitz",
};
const CHESSCOM: PlayerHit = {
  id: "chesscom:hikaru",
  source: "chesscom",
  username: "hikaru",
  displayName: "Hikaru",
  subtitle: "Chess.com",
};
// A studio name comes from PGN headers: spaces, commas and apostrophes are normal.
const STUDIO: PlayerHit = {
  id: "studio:Sant'Anna, Eddie",
  source: "studio",
  username: "Sant'Anna, Eddie",
  displayName: "Sant'Anna, Eddie",
  subtitle: "",
  inDatabases: true,
};

const PLAYERS_URL = "?view=library&mode=players";
const LICHESS_URL = `${PLAYERS_URL}&player=lichess%3Amagnus`;
const CHESSCOM_URL = `${PLAYERS_URL}&player=chesscom%3Ahikaru`;
const STUDIO_URL = `${PLAYERS_URL}&player=studio%3ASant%27Anna%2C+Eddie`;

function Harness() {
  useWorkspaceViewUrl();
  return null;
}

function navigateTo(path: string): void {
  // The test Window starts on about:blank, where relative history URLs are a
  // no-op; give it a real origin first.
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(`http://localhost${path}`);
}

before(() => setupDom());
after(() => teardownDom());
beforeEach(() => {
  useStudioStore.setState({ workspaceView: "studio", settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  useLibraryStore.setState({ mode: "games" });
  useDossierStore.setState({
    player: null,
    filters: DEFAULT_OVERVIEW_FILTERS,
    selectedLine: null,
    selectedOpening: null,
  });
  navigateTo("/studio");
});
afterEach(() => cleanup());

test("a player and color round-trip through the URL for every origin", () => {
  for (const [hit, color] of [
    [LICHESS, "all"],
    [CHESSCOM, "white"],
    [STUDIO, "black"],
  ] as [PlayerHit, PlayerColorFilter][]) {
    const search = withLibraryPlayer(PLAYERS_URL, hit, color);
    const parsed = parseLibraryPlayer(search);
    assert.equal(parsed?.player.id, hit.id);
    assert.equal(parsed?.player.source, hit.source);
    assert.equal(parsed?.player.username, hit.username);
    assert.equal(parsed?.player.displayName, hit.username);
    assert.equal(parsed?.player.subtitle, "");
    assert.equal(parsed?.color, color);
  }

  // Names with spaces, commas and apostrophes survive the parameter.
  const studio = new URLSearchParams(withLibraryPlayer(PLAYERS_URL, STUDIO)).get("player");
  assert.equal(studio, "studio:Sant'Anna, Eddie");
  assert.equal(parseLibraryPlayer(STUDIO_URL)?.player.id, STUDIO.id);
});

test("only the studio origin is flagged as coming from the databases", () => {
  assert.equal(parseLibraryPlayer(PLAYERS_URL + "&player=lichess%3Amagnus")?.player.inDatabases, undefined);
  assert.equal(parseLibraryPlayer(PLAYERS_URL + "&player=chesscom%3Ahikaru")?.player.inDatabases, undefined);
  assert.equal(parseLibraryPlayer(STUDIO_URL)?.player.inDatabases, true);
});

test("the player is only kept with view=library&mode=players; color=all is omitted", () => {
  assert.equal(parseLibraryPlayer(`?player=lichess:magnus`), null);
  assert.equal(parseLibraryPlayer(`?view=library&player=lichess:magnus`), null);
  assert.equal(parseLibraryPlayer(`?view=library&mode=games&player=lichess:magnus`), null);
  assert.equal(withLibraryPlayer(`?view=library&mode=games&player=lichess:magnus`, LICHESS), "?view=library&mode=games");
  assert.equal(withLibraryPlayer(PLAYERS_URL, LICHESS, "all"), LICHESS_URL);
  assert.equal(withLibraryPlayer(PLAYERS_URL, null, "white"), PLAYERS_URL);
});

test("invalid player values are ignored", () => {
  assert.equal(parseLibraryPlayer(PLAYERS_URL + "&player=magnus"), null);
  assert.equal(parseLibraryPlayer(PLAYERS_URL + "&player=lichess%3A"), null);
  assert.equal(parseLibraryPlayer(PLAYERS_URL + "&player=%3Amagnus"), null);
  assert.equal(parseLibraryPlayer(PLAYERS_URL + "&player=fide%3Amagnus"), null);
  assert.equal(parseLibraryPlayer(PLAYERS_URL + "&player=lichess%3Abad+name%21"), null);
  assert.equal(parseLibraryPlayer(PLAYERS_URL + "&player=lichess%3A" + "a".repeat(41)), null);
  assert.equal(parseLibraryPlayer(PLAYERS_URL + "&player=studio%3A"), null);
  // A bad color falls back to all; the entry itself is still valid.
  assert.equal(parseLibraryPlayer(LICHESS_URL + "&color=red")?.color, "all");
});

test("loading a URL with a player opens Players with that dossier and color", () => {
  navigateTo(`/studio${CHESSCOM_URL}&color=black`);
  render(<Harness />);

  assert.equal(useStudioStore.getState().workspaceView, "library");
  assert.equal(useLibraryStore.getState().mode, "players");
  assert.equal(useDossierStore.getState().player?.id, CHESSCOM.id);
  assert.equal(useDossierStore.getState().filters.color, "black");
  assert.equal(window.location.search, `${CHESSCOM_URL}&color=black`);
});

test("opening players pushes history entries and closing returns to the plain search", () => {
  render(<Harness />);
  act(() => useStudioStore.getState().setWorkspaceView("library"));
  act(() => useLibraryStore.getState().setMode("players"));
  assert.equal(window.location.search, PLAYERS_URL);

  const length = window.history.length;
  act(() => useDossierStore.getState().openPlayer(LICHESS));
  assert.equal(window.location.search, LICHESS_URL);
  assert.equal(window.history.length, length + 1);

  act(() => useDossierStore.getState().openPlayer(CHESSCOM));
  assert.equal(window.location.search, CHESSCOM_URL);
  assert.equal(window.history.length, length + 2);

  act(() => useDossierStore.getState().closePlayer());
  assert.equal(useDossierStore.getState().player, null);
  assert.equal(window.location.search, PLAYERS_URL);
  assert.equal(window.history.length, length + 3);
});

test("changing only the color replaces the history entry", () => {
  navigateTo(`/studio${LICHESS_URL}`);
  render(<Harness />);
  const length = window.history.length;

  act(() => useDossierStore.getState().setFilters({ ...useDossierStore.getState().filters, color: "white" }));
  assert.equal(window.location.search, `${LICHESS_URL}&color=white`);
  assert.equal(window.history.length, length);

  act(() => useDossierStore.getState().openPlayer(LICHESS, "black"));
  assert.equal(window.location.search, `${LICHESS_URL}&color=black`);
  assert.equal(window.history.length, length);

  act(() => useDossierStore.getState().openPlayer(LICHESS, "all"));
  assert.equal(window.location.search, LICHESS_URL);
  assert.equal(window.history.length, length);
});

test("switching to Games removes the player and color but keeps the dossier open", () => {
  navigateTo(`/studio${LICHESS_URL}&color=white`);
  render(<Harness />);

  act(() => useLibraryStore.getState().setMode("games"));
  assert.equal(window.location.search, "?view=library");
  // The dossier is not closed: only the URL drops it.
  assert.equal(useDossierStore.getState().player?.id, LICHESS.id);

  act(() => useLibraryStore.getState().setMode("players"));
  assert.equal(window.location.search, `${LICHESS_URL}&color=white`);
});

test("leaving the Library removes the player and color, and coming back restores them", () => {
  navigateTo(`/studio${LICHESS_URL}&color=white`);
  render(<Harness />);

  act(() => useStudioStore.getState().setWorkspaceView("studio"));
  assert.equal(window.location.search, "");
  assert.equal(useDossierStore.getState().player?.id, LICHESS.id);

  act(() => useStudioStore.getState().setWorkspaceView("library"));
  assert.equal(window.location.search, `${LICHESS_URL}&color=white`);
});

test("Back and Forward move between players and back to the plain search", () => {
  navigateTo(`/studio${PLAYERS_URL}`);
  render(<Harness />);
  act(() => useDossierStore.getState().openPlayer(LICHESS));
  act(() => useDossierStore.getState().openPlayer(CHESSCOM));

  // happy-dom does not walk session history: emulate the browser's Back and
  // Forward by moving to the entry's URL and firing popstate.
  const backTo = (search: string) => {
    act(() => {
      navigateTo(`/studio${search}`);
      window.dispatchEvent(new window.Event("popstate"));
    });
  };

  backTo(LICHESS_URL);
  assert.equal(useDossierStore.getState().player?.id, LICHESS.id);
  assert.equal(window.location.search, LICHESS_URL);

  backTo(PLAYERS_URL);
  assert.equal(useDossierStore.getState().player, null);
  assert.equal(useLibraryStore.getState().mode, "players");

  backTo(LICHESS_URL);
  assert.equal(useDossierStore.getState().player?.id, LICHESS.id);

  backTo(CHESSCOM_URL);
  assert.equal(useDossierStore.getState().player?.id, CHESSCOM.id);
  assert.equal(window.location.search, CHESSCOM_URL);
});

test("an invalid player value is ignored, the plain search is shown and the value removed", () => {
  navigateTo(`/studio${PLAYERS_URL}&player=lichess%3Abad+name%21&color=white`);
  render(<Harness />);

  assert.equal(useDossierStore.getState().player, null);
  assert.equal(useDossierStore.getState().filters.color, "all");
  assert.equal(useLibraryStore.getState().mode, "players");
  assert.equal(window.location.search, PLAYERS_URL);
});

test("a color without a player is removed", () => {
  navigateTo(`/studio${PLAYERS_URL}&color=black`);
  render(<Harness />);

  assert.equal(useDossierStore.getState().player, null);
  assert.equal(window.location.search, PLAYERS_URL);
});
