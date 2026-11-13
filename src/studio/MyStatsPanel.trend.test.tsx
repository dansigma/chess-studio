// SIG-1306: clicking a trend dot runs the My Games open flow.
import assert from "node:assert/strict";
import { after, afterEach, before, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PlayerGame } from "../lib/player-types.ts";

function g(id: string, color: "white" | "black"): PlayerGame {
  return {
    id, winner: null, whiteName: "U", whiteRating: null, blackName: "O", blackRating: null,
    year: 2026, month: 10, event: null, eco: null, opening: null, color, playerResult: "win",
    playedAt: Number(id.slice(1)) + 1, rowId: null, userAccuracy: 80, opponentAccuracy: null,
    reviewedAt: "2026-10-01", mistakeCounts: null,
  };
}
const loaded = [g("g0", "white"), g("g1", "white"), g("g2", "black")];

const openBoardPanel = mock.fn();
mock.module("@/src/lib/my-games/load-games", {
  namedExports: {
    loadCappedMyGames: async () => ({ ok: true, cancelled: false, games: loaded }),
    myGamesRowToPlayerGame: () => null,
    loadMyGames: async () => ({ ok: false }),
    MY_GAMES_PAGE_SIZE: 50,
  },
});
mock.module("@/src/lib/supabase/client", { namedExports: { createBrowserSupabase: () => ({}) } });
mock.module("./dock-api", { namedExports: { openBoardPanel } });

const { MyStatsPanel } = await import("./MyStatsPanel.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

before(() => setupDom());
afterEach(() => cleanup());
after(async () => {
  await teardownDom();
});

test("clicking a dot imports the game, flips for black and opens the board panel", async () => {
  const importPlayerGame = mock.fn();
  const flip = mock.fn();
  useStudioStore.setState({
    user: { id: "u1" } as never,
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    importPlayerGame: importPlayerGame as never,
    flip: flip as never,
  });
  render(<MyStatsPanel />);
  await waitFor(() => assert.equal(screen.getAllByTestId("trend-dot").length, 3));
  fireEvent.click(screen.getAllByTestId("trend-dot")[2]!);
  assert.equal(importPlayerGame.mock.callCount(), 1);
  const [game, opts] = importPlayerGame.mock.calls[0]!.arguments as [PlayerGame, unknown];
  assert.equal(game.id, "g2");
  assert.deepEqual(opts, { openInNewBoard: true });
  assert.equal(flip.mock.callCount(), 1);
  assert.equal(openBoardPanel.mock.callCount(), 1);
});
