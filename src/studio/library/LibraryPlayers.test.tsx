// SIG-1318: Library Players mode (search, open player, mode switch).
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PlayerHit } from "@/src/lib/player-types";

const { LibraryPlayers } = await import("./LibraryPlayers.tsx");
const { LibraryView } = await import("./LibraryView.tsx");
const { useLibraryStore } = await import("./library-store.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { DEFAULT_LIBRARY_FILTERS } = await import("@/src/lib/library/types.ts");
const { registerLibrarySource, clearLibrarySources } = await import("@/src/lib/library/sources.ts");

const HIT: PlayerHit = { id: "lichess:magnus", source: "lichess", username: "magnus", displayName: "Magnus", subtitle: "2800 blitz", title: "GM" };
const realFetch = globalThis.fetch;
const urls: string[] = [];

before(() => setupDom());
after(() => teardownDom());
beforeEach(() => {
  urls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ players: [HIT] }), { status: 200 });
  }) as typeof fetch;
  act(() => {
    useStudioStore.setState({ workspaceView: "library", settings: { ...DEFAULT_SETTINGS, locale: "en" }, playerProfile: null, bookmarks: [] });
    useLibraryStore.setState({ mode: "games", filters: DEFAULT_LIBRARY_FILTERS, selectedKey: null });
  });
});
afterEach(() => {
  cleanup();
  clearLibrarySources();
  globalThis.fetch = realFetch;
});

test("debounces, fetches once and lists results; opening a player switches to the Studio", async () => {
  render(<LibraryPlayers />);
  assert.ok(screen.getByText(/Type at least two letters/));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "ma" } });
  fireEvent.change(input, { target: { value: "mag" } });
  assert.equal(urls.length, 0);
  assert.ok(await screen.findByText("Magnus", {}, { timeout: 2000 }));
  assert.deepEqual(urls, ["/api/players/search?q=mag"]);
  assert.ok(screen.getByText(/exact username/));
  fireEvent.click(screen.getByText("Magnus"));
  assert.equal(useStudioStore.getState().playerProfile?.id, HIT.id);
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("shows the empty state when nothing matches", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ players: [] }), { status: 200 })) as typeof fetch;
  render(<LibraryPlayers />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzz" } });
  assert.ok(await screen.findByText("No players found.", {}, { timeout: 2000 }));
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

test("a player from the user's databases opens the Library's Games tab filtered by that player", async () => {
  const local: PlayerHit = {
    id: "studio:Sant'Anna, Eddie",
    source: "studio",
    username: "Sant'Anna, Eddie",
    displayName: "Sant'Anna, Eddie",
    subtitle: "Studio database",
    inDatabases: true,
  };
  globalThis.fetch = (async () => new Response(JSON.stringify({ players: [local] }), { status: 200 })) as typeof fetch;
  const stub = (id: string) =>
    ({ id, label: () => id, capabilities: () => ({}) }) as unknown as Parameters<typeof registerLibrarySource>[0];
  registerLibrarySource(stub("my-games"));
  registerLibrarySource(stub("file:db1"));
  registerLibrarySource(stub("file:db2"));
  act(() => useLibraryStore.setState({ mode: "players", filters: { ...DEFAULT_LIBRARY_FILTERS, query: "old" } }));
  render(<LibraryPlayers />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "sant" } });
  fireEvent.click(await screen.findByText("Sant'Anna, Eddie", {}, { timeout: 2000 }));
  const library = useLibraryStore.getState();
  assert.equal(library.mode, "games");
  assert.equal(library.filters.player, "Sant'Anna, Eddie");
  assert.equal(library.filters.playerColor, "both");
  assert.equal(library.filters.query, "");
  assert.deepEqual(library.filters.sources, ["file:db1", "file:db2"]);
  assert.equal(useStudioStore.getState().playerProfile, null);
  assert.equal(useStudioStore.getState().workspaceView, "library");
});

test("the W/B chips on a local player set the player's side filter", async () => {
  const local: PlayerHit = { id: "studio:Eddie", source: "studio", username: "Eddie", displayName: "Eddie", subtitle: "Studio database", inDatabases: true };
  globalThis.fetch = (async () => new Response(JSON.stringify({ players: [local] }), { status: 200 })) as typeof fetch;
  act(() => useLibraryStore.setState({ mode: "players" }));
  render(<LibraryPlayers />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "ed" } });
  await screen.findByText("Eddie", {}, { timeout: 2000 });
  fireEvent.click(screen.getByTitle(/black/i));
  assert.equal(useLibraryStore.getState().filters.playerColor, "black");
  assert.equal(useLibraryStore.getState().mode, "games");
});
