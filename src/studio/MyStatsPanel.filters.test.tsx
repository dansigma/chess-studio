// SIG-1305: Overview filter bar, KPI cards, empty states, colour-tab behaviour.
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

const { MyStatsPanel } = await import("./MyStatsPanel.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

const DAY = 86_400_000;
function g(id: string, over: Partial<PlayerGame>): PlayerGame {
  return {
    id, winner: null, whiteName: "U", whiteRating: null, blackName: "O", blackRating: null,
    year: 2026, month: 10, event: null, eco: null, opening: "Italian Game", color: "white",
    playerResult: "win", playedAt: Date.now() - DAY, rowId: null,
    userAccuracy: 80, opponentAccuracy: null, reviewedAt: "2026-10-01", mistakeCounts: null,
    timeClass: "blitz", ...over,
  };
}

before(() => setupDom());
afterEach(() => cleanup());
after(async () => {
  await teardownDom();
});
beforeEach(() => cleanup());

function setup() {
  // 4 recent white blitz wins (reviewed), 3 old black rapid losses (reviewed).
  loaded = [
    ...[0, 1, 2, 3].map((i) => g(`w${i}`, {})),
    ...[0, 1, 2].map((i) => g(`b${i}`, {
      color: "black", playerResult: "loss", timeClass: "rapid", userAccuracy: 60,
      opening: "French Defense", playedAt: Date.now() - 200 * DAY,
    })),
  ];
  useStudioStore.setState({ user: { id: "u1" } as never, settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  return render(<MyStatsPanel />);
}

test("changing a filter updates KPIs and sections", async () => {
  setup();
  await waitFor(() => assert.equal(screen.getByTestId("kpi-games").textContent, "7"));
  assert.equal(screen.getByTestId("kpi-reviewed").textContent, "7 reviewed");
  fireEvent.change(screen.getByLabelText("Period"), { target: { value: "m1" } });
  assert.equal(screen.getByTestId("kpi-games").textContent, "4");
  assert.equal(screen.getByTestId("kpi-score").textContent, "100%");
  assert.equal(screen.queryByText("French Defense"), null);
});

test("fewer than 3 reviewed in filter shows hints but keeps counts", async () => {
  setup();
  await waitFor(() => assert.ok(screen.getByTestId("kpi-games")));
  fireEvent.change(screen.getByLabelText("Time control"), { target: { value: "rapid" } });
  fireEvent.change(screen.getByLabelText("Period"), { target: { value: "m12" } });
  assert.equal(screen.getByTestId("kpi-games").textContent, "3");
  // Narrow further so reviewed < 3: only 4 white blitz exist; filter black + m1 => empty instead.
  fireEvent.click(screen.getByRole("button", { name: "White" }));
  assert.ok(screen.getByTestId("mystats-filter-empty"));
});

test("empty filter shows friendly message with reset", async () => {
  setup();
  await waitFor(() => assert.ok(screen.getByTestId("kpi-games")));
  fireEvent.click(screen.getByRole("button", { name: "White" }));
  fireEvent.change(screen.getByLabelText("Time control"), { target: { value: "rapid" } });
  assert.ok(screen.getByTestId("mystats-filter-empty"));
  assert.equal(screen.queryByTestId("mystats-kpis"), null);
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  assert.equal(screen.getByTestId("kpi-games").textContent, "7");
});

test("colour filter hides the openings White/Black tabs", async () => {
  setup();
  await waitFor(() => assert.ok(screen.getByTestId("kpi-games")));
  const tabCount = () => screen.getAllByRole("tab").length;
  const before = tabCount();
  fireEvent.click(screen.getByRole("button", { name: "Black" }));
  assert.equal(tabCount(), before - 2);
  assert.ok(screen.getByText("French Defense"));
  assert.equal(screen.queryByText("Italian Game"), null);
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  assert.equal(tabCount(), before);
});
