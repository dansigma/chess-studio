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
    useLibraryStore.setState({ mode: "games" });
  });
});
afterEach(() => {
  cleanup();
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
