// SIG-1385: the <3-reviewed gate shows "N of 3 games reviewed" progress and a
// "Review a game" button that opens the Review dock panel; it disappears at 3.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PlayerGame } from "../lib/player-types.ts";

let loaded: PlayerGame[] = [];

mock.module("@/src/lib/my-games/load-games", {
  namedExports: {
    loadCappedMyGames: async () => ({ ok: true, cancelled: false, games: loaded }),
    myGamesRowToPlayerGame: () => null,
    loadMyGames: async () => ({ ok: false }),
    MY_GAMES_PAGE_SIZE: 50,
  },
});
mock.module("@/src/lib/supabase/client", {
  namedExports: { createBrowserSupabase: () => ({}) },
});
const openStudioPanel = mock.fn();
mock.module("./dock-api", {
  namedExports: { openBoardPanel: mock.fn(), openStudioPanel },
});

const { MyStatsPanel } = await import("./MyStatsPanel.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

function g(id: string, reviewed: boolean): PlayerGame {
  return {
    id, winner: null, whiteName: "U", whiteRating: null, blackName: "O", blackRating: null,
    year: 2026, month: 10, event: null, eco: null, opening: "Italian Game", color: "white",
    playerResult: "win", playedAt: 1, rowId: null,
    userAccuracy: reviewed ? 80 : null, opponentAccuracy: null,
    reviewedAt: reviewed ? "2026-10-01" : null, mistakeCounts: null,
  };
}

before(() => setupDom());
afterEach(() => cleanup());
after(async () => {
  await teardownDom();
});
beforeEach(() => cleanup());

function setup(reviewed: number, locale: "en" | "pt-br" = "en") {
  // 4 games; the first `reviewed` count as reviewed.
  loaded = [0, 1, 2, 3].map((i) => g(`g${i}`, i < reviewed));
  useStudioStore.setState({
    user: { id: "u1" } as never,
    settings: { ...DEFAULT_SETTINGS, locale },
  });
  return render(<MyStatsPanel />);
}

test("gate shows progress at 0, 1 and 2 reviewed games and opens Review", async () => {
  for (const reviewed of [0, 1, 2]) {
    const { unmount } = setup(reviewed);
    await waitFor(() =>
      assert.equal(
        screen.getByTestId("mystats-review-gate").textContent?.includes(`${reviewed} of 3 games reviewed`),
        true,
      ),
    );
    const bar = screen.getByRole("progressbar");
    assert.equal(bar.getAttribute("aria-valuenow"), String(reviewed));
    assert.equal(bar.getAttribute("aria-valuemax"), "3");
    fireEvent.click(screen.getByRole("button", { name: "Review a game" }));
    assert.equal(openStudioPanel.mock.callCount() > 0, true);
    assert.deepEqual(openStudioPanel.mock.calls.at(-1)?.arguments, ["review"]);
    unmount();
  }
});

test("gate disappears at 3 reviewed games", async () => {
  setup(3);
  await waitFor(() => assert.ok(screen.getByTestId("kpi-games")));
  assert.equal(screen.queryByTestId("mystats-review-gate"), null);
  assert.equal(screen.queryByText(/of 3 games reviewed/), null);
});

test("pt-br gate reads 'N de 3 partidas revisadas' with 'Revisar partida'", async () => {
  setup(1, "pt-br");
  await waitFor(() => assert.ok(screen.getByText("1 de 3 partidas revisadas")));
  assert.ok(screen.getByRole("button", { name: "Revisar partida" }));
});

test("filters that leave fewer than 3 reviewed games show the gate once", async () => {
  loaded = [
    g("w1", true),
    g("w2", true),
    g("w3", true),
    { ...g("b1", true), color: "black" },
  ];
  useStudioStore.setState({
    user: { id: "u1" } as never,
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
  });
  render(<MyStatsPanel />);
  await waitFor(() => assert.ok(screen.getByTestId("kpi-games")));
  assert.equal(screen.queryByTestId("mystats-review-gate"), null);
  fireEvent.click(screen.getByRole("button", { name: "Black", pressed: false }));
  await waitFor(() => assert.equal(screen.getAllByTestId("mystats-review-gate").length, 1));
  assert.ok(screen.getByText("1 of 3 games reviewed"));
});
