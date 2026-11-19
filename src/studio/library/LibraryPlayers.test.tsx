// SIG-1318: Library Players mode (search, open player, mode switch).
// SIG-1338: selecting a player opens the preparation dossier in place.
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { PlayerHit } from "@/src/lib/player-types";

const { LibraryPlayers } = await import("./LibraryPlayers.tsx");
const { LibraryView } = await import("./LibraryView.tsx");
const { useLibraryStore } = await import("./library-store.ts");
const { useDossierStore } = await import("./dossier/dossier-store.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { DEFAULT_LIBRARY_FILTERS } = await import("@/src/lib/library/types.ts");
const { clearLibrarySources } = await import("@/src/lib/library/sources.ts");

const HIT: PlayerHit = { id: "lichess:magnus", source: "lichess", username: "magnus", displayName: "Magnus", subtitle: "2800 blitz", title: "GM" };
const CHESSCOM: PlayerHit = { id: "chesscom:hikaru", source: "chesscom", username: "hikaru", displayName: "Hikaru", subtitle: "Chess.com" };
const LOCAL: PlayerHit = {
  id: "studio:Sant'Anna, Eddie",
  source: "studio",
  username: "Sant'Anna, Eddie",
  displayName: "Sant'Anna, Eddie",
  subtitle: "Studio database",
  inDatabases: true,
};
const realFetch = globalThis.fetch;
const urls: string[] = [];

const pgn = (white: string, black: string) =>
  `[White "${white}"]\n[Black "${black}"]\n[Result "*"]\n\n1. e4 *`;

function fileDatabase(id: string, games: Array<[string, string]>) {
  return {
    id,
    remoteId: null,
    name: id,
    folderId: null,
    games: games.map(([white, black], index) => ({
      id: `${id}-${index}`,
      white,
      black,
      result: "*",
      event: "",
      date: "",
      title: `${white} vs ${black}`,
      pgn: pgn(white, black),
    })),
  };
}

const setDatabases = (databases: unknown[]) =>
  useStudioStore.setState((state) => ({ files: { ...state.files, databases: databases as never } }));

before(() => setupDom());
after(() => teardownDom());
beforeEach(() => {
  urls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ players: [HIT] }), { status: 200 });
  }) as typeof fetch;
  act(() => {
    useStudioStore.setState({ workspaceView: "library", settings: { ...DEFAULT_SETTINGS, locale: "en" }, playerProfile: null, bookmarks: [], files: { folders: [], databases: [] } });
    useLibraryStore.setState({ mode: "games", filters: DEFAULT_LIBRARY_FILTERS, selectedKey: null });
    useDossierStore.getState().closePlayer();
  });
});
afterEach(() => {
  cleanup();
  clearLibrarySources();
  globalThis.fetch = realFetch;
});

async function searchFor(value: string, text: string | RegExp = "Magnus") {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
  return screen.findByText(text, {}, { timeout: 2000 });
}

test("debounces, fetches once and lists results; opening a player opens the dossier in place", async () => {
  render(<LibraryPlayers />);
  assert.ok(screen.getByText(/Type at least two letters/));
  assert.equal(screen.queryByTestId("library-players-bookmarked"), null);
  assert.equal(screen.queryByTestId("library-players-local"), null);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "ma" } });
  fireEvent.change(input, { target: { value: "mag" } });
  assert.equal(urls.length, 0);
  assert.ok(await screen.findByText("Magnus", {}, { timeout: 2000 }));
  assert.deepEqual(urls, ["/api/players/search?q=mag"]);
  assert.ok(screen.getByText(/exact username/));
  fireEvent.click(screen.getByText("Magnus"));
  assert.equal(useDossierStore.getState().player?.id, HIT.id);
  // The Studio is not touched: the dossier lives in the Players tab.
  assert.equal(useStudioStore.getState().playerProfile, null);
  assert.equal(useStudioStore.getState().workspaceView, "library");
  const dossier = screen.getByTestId("library-player-dossier");
  assert.ok(within(dossier).getByRole("heading", { name: "Magnus" }));
  assert.match(within(dossier).getByTestId("dossier-player-meta").textContent ?? "", /Lichess/);
});

test("shows the empty state when nothing matches", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ players: [] }), { status: 200 })) as typeof fetch;
  render(<LibraryPlayers />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzz" } });
  assert.ok(await screen.findByText("No players found.", {}, { timeout: 2000 }));
  assert.ok(screen.getByTestId("library-player-dossier-hint"));
});

test("the mode switch toggles between Games and Players", async () => {
  await act(async () => {
    render(<LibraryView />);
  });
  assert.equal(screen.getByRole("tab", { name: "Games" }).getAttribute("aria-selected"), "true");
  assert.ok(screen.getByTestId("library-table-slot"));
  fireEvent.click(screen.getByRole("tab", { name: "Players" }));
  assert.equal(useLibraryStore.getState().mode, "players");
  assert.ok(screen.getByTestId("library-players"));
  assert.equal(screen.queryByTestId("library-table-slot"), null);
  fireEvent.click(screen.getByRole("tab", { name: "Games" }));
  assert.equal(useLibraryStore.getState().mode, "games");
});

test("a player from the user's databases opens the dossier without touching Library filters", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ players: [LOCAL] }), { status: 200 })) as typeof fetch;
  act(() => useLibraryStore.setState({ mode: "players", filters: { ...DEFAULT_LIBRARY_FILTERS, query: "old" } }));
  render(<LibraryPlayers />);
  fireEvent.click(await searchFor("sant", "Sant'Anna, Eddie"));
  const library = useLibraryStore.getState();
  assert.equal(library.mode, "players");
  assert.equal(library.filters.player, "");
  assert.equal(library.filters.query, "old");
  assert.equal(useStudioStore.getState().playerProfile, null);
  assert.equal(useStudioStore.getState().workspaceView, "library");
  assert.equal(useDossierStore.getState().player?.id, LOCAL.id);
  const dossier = screen.getByTestId("library-player-dossier");
  assert.match(within(dossier).getByTestId("dossier-player-meta").textContent ?? "", /Local database/);
});

test("the dossier header names the origin for Lichess, Chess.com and the local database", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ players: [HIT, CHESSCOM, LOCAL] }), { status: 200 })) as typeof fetch;
  render(<LibraryPlayers />);
  await searchFor("ma");
  const list = () => screen.getByTestId("library-players-list");
  const dossier = () => screen.getByTestId("library-player-dossier");

  fireEvent.click(within(list()).getByText("Magnus"));
  assert.match(within(dossier()).getByTestId("dossier-player-meta").textContent ?? "", /Lichess/);

  fireEvent.click(within(list()).getByText("Hikaru"));
  assert.match(within(dossier()).getByTestId("dossier-player-meta").textContent ?? "", /Chess\.com/);

  fireEvent.click(within(list()).getByText("Sant'Anna, Eddie"));
  assert.match(within(dossier()).getByTestId("dossier-player-meta").textContent ?? "", /Local database/);
});

test("the W/B chips open the dossier with that colour preselected", async () => {
  act(() => useLibraryStore.setState({ mode: "players" }));
  render(<LibraryPlayers />);
  await searchFor("ma");

  fireEvent.click(screen.getByTitle(/white/i));
  assert.equal(useDossierStore.getState().filters.color, "white");
  const dossier = screen.getByTestId("library-player-dossier");
  assert.equal(within(dossier).getByRole("button", { name: "White" }).getAttribute("aria-pressed"), "true");

  fireEvent.click(screen.getByTitle(/black/i));
  assert.equal(useDossierStore.getState().filters.color, "black");
  assert.equal(within(dossier).getByRole("button", { name: "Black" }).getAttribute("aria-pressed"), "true");
});

test("Open in Studio runs the old online-player flow with the filters' colour", async () => {
  render(<LibraryPlayers />);
  await searchFor("ma");
  fireEvent.click(screen.getByTitle(/white/i));
  fireEvent.click(screen.getByRole("button", { name: "Open in Studio" }));
  assert.equal(useStudioStore.getState().playerProfile?.id, HIT.id);
  assert.equal(useStudioStore.getState().playerColorFilter, "white");
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("the search column collapses to a strip while a player is selected and reopens", async () => {
  render(<LibraryPlayers />);
  await searchFor("ma");
  assert.ok(screen.getByRole("textbox"));
  fireEvent.click(screen.getByText("Magnus"));
  assert.ok(screen.getByRole("textbox"));

  fireEvent.click(screen.getByRole("button", { name: "Hide player search" }));
  assert.equal(screen.queryByRole("textbox"), null);
  assert.ok(screen.getByTestId("library-players-strip"));
  assert.ok(screen.getByTestId("library-player-dossier"));

  fireEvent.click(screen.getByRole("button", { name: "Show player search" }));
  assert.ok(screen.getByRole("textbox"));
  assert.ok(screen.getByTestId("library-players-list"));
});

test("the selected player is highlighted in the list and closing the dossier clears it", async () => {
  render(<LibraryPlayers />);
  await searchFor("ma");
  const rowText = screen.getByText("Magnus");
  const row = rowText.closest("div.relative");
  fireEvent.click(rowText);
  assert.ok(row?.className.includes("bg-studio-accent-soft"));

  fireEvent.click(screen.getByRole("button", { name: "Close dossier" }));
  assert.equal(useDossierStore.getState().player, null);
  assert.ok(screen.getByTestId("library-player-dossier-hint"));
});

test("bookmarks still toggle without opening the dossier", async () => {
  render(<LibraryPlayers />);
  await searchFor("ma");
  fireEvent.click(screen.getByTitle("Bookmark player"));
  assert.equal(useStudioStore.getState().bookmarks.length, 1);
  assert.equal(useDossierStore.getState().player, null);
});

test("before typing, bookmarked players are listed and open the dossier in one click", () => {
  act(() => useStudioStore.setState({ bookmarks: [{ ...HIT, bookmarkedAt: 1 }] }));
  render(<LibraryPlayers />);

  assert.equal(screen.queryByText(/Type at least two letters/), null);
  const section = screen.getByTestId("library-players-bookmarked");
  assert.match(section.textContent ?? "", /Bookmarked players/);
  assert.equal(screen.queryByTestId("library-players-local"), null);

  fireEvent.click(within(section).getByText("Magnus"));
  assert.equal(useDossierStore.getState().player?.id, HIT.id);
  assert.ok(within(screen.getByTestId("library-player-dossier")).getByRole("heading", { name: "Magnus" }));

  // The row's bookmark button still only toggles the bookmark.
  fireEvent.click(within(section).getByTitle("Remove bookmark"));
  assert.equal(useStudioStore.getState().bookmarks.length, 0);
  assert.equal(useDossierStore.getState().player?.id, HIT.id);
});

test("before typing, frequent local players are listed with the local handoff", () => {
  act(() =>
    setDatabases([
      fileDatabase("d1", [
        ["Magnus", "Hikaru"],
        ["Magnus", "Nepo"],
        ["Magnus", "Hikaru"],
      ]),
    ]),
  );
  render(<LibraryPlayers />);

  const section = screen.getByTestId("library-players-local");
  assert.match(section.textContent ?? "", /Frequent in your PGN files/);
  // Most games first: Magnus (3) before Hikaru (2) and Nepo (1).
  assert.ok((section.textContent ?? "").indexOf("Magnus") < (section.textContent ?? "").indexOf("Hikaru"));

  fireEvent.click(within(section).getByText("Magnus"));
  assert.equal(useDossierStore.getState().player?.id, "studio:Magnus");
  const dossier = screen.getByTestId("library-player-dossier");
  assert.match(within(dossier).getByTestId("dossier-player-meta").textContent ?? "", /Local database/);
  assert.ok(within(dossier).getByRole("button", { name: "View in Games tab" }));
  // SIG-1405: the Studio cannot load a local-only player, so no broken handoff.
  assert.equal(within(dossier).queryByRole("button", { name: "Open in Studio" }), null);
});

test("a bookmarked local player is not repeated locally and keeps the local handoff", () => {
  act(() => {
    useStudioStore.setState({ bookmarks: [{ ...LOCAL, bookmarkedAt: 1 }] });
    setDatabases([fileDatabase("d1", [[LOCAL.username, "Other"]])]);
  });
  render(<LibraryPlayers />);

  const bookmarked = screen.getByTestId("library-players-bookmarked");
  assert.ok(within(bookmarked).getByText(LOCAL.username));
  const local = screen.getByTestId("library-players-local");
  assert.ok(within(local).getByText("Other"));
  assert.equal(within(local).queryByText(LOCAL.username), null);

  fireEvent.click(within(bookmarked).getByText(LOCAL.username));
  const dossier = screen.getByTestId("library-player-dossier");
  assert.equal(useDossierStore.getState().player?.id, LOCAL.id);
  assert.ok(within(dossier).getByRole("button", { name: "View in Games tab" }));
  assert.equal(within(dossier).queryByRole("button", { name: "Open in Studio" }), null);
});
