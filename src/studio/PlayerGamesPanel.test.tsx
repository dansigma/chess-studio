// SIG-1347: the player-games panel's "Prepare against" shortcut now opens the
// player's dossier in the Library instead of the retired Opponent prep panel.
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PlayerHit } from "@/src/lib/player-types";
import { PlayerGamesPanel } from "./PlayerGamesPanel";
import { useDossierStore } from "./library/dossier/dossier-store";
import { useLibraryStore } from "./library/library-store";
import { useStudioStore } from "@/src/store/studio-store";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings.ts";
import { DEFAULT_LIBRARY_FILTERS } from "@/src/lib/library/types.ts";

const PLAYER: PlayerHit = {
  id: "lichess:magnus",
  source: "lichess",
  username: "magnus",
  displayName: "Magnus",
  subtitle: "Lichess",
};

const realFetch = globalThis.fetch;

before(() => setupDom());
after(() => teardownDom());
beforeEach(() => {
  // The panel fetches the player's games on mount; this test only needs the
  // shortcut, so never resolve it.
  globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
  useStudioStore.setState({
    workspaceView: "studio",
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    playerProfile: PLAYER,
    playerGames: [],
    playerGamesLoading: false,
    playerGamesNotice: null,
  });
  useLibraryStore.setState({ mode: "games", filters: DEFAULT_LIBRARY_FILTERS, selectedKey: null });
  useDossierStore.getState().closePlayer();
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

test("Prepare against selects the player and switches to the Library's Players mode", () => {
  render(<PlayerGamesPanel />);

  fireEvent.click(screen.getByRole("button", { name: "Prepare against" }));

  assert.equal(useStudioStore.getState().workspaceView, "library");
  assert.equal(useLibraryStore.getState().mode, "players");
  assert.equal(useDossierStore.getState().player?.id, PLAYER.id);
});
