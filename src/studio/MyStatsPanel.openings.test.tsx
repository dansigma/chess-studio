// SIG-1304: results-by-opening — player-perspective bar, sort, min games, pt-BR names.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function g(id: string, opening: string, playerResult: "win" | "draw" | "loss", reviewed = false): PlayerGame {
  return {
    id, winner: null, whiteName: "U", whiteRating: null, blackName: "O", blackRating: null,
    year: 2026, month: 10, event: null, eco: null, opening, color: "white", playerResult,
    playedAt: 1, rowId: null,
    userAccuracy: reviewed ? 80 : null, opponentAccuracy: null,
    reviewedAt: reviewed ? "2026-10-01" : null, mistakeCounts: null,
  };
}
function many(prefix: string, opening: string, results: Array<"win" | "draw" | "loss">): PlayerGame[] {
  return results.map((r, i) => g(`${prefix}${i}`, opening, r, i < 2));
}

before(() => setupDom());
afterEach(() => cleanup());
after(async () => {
  await teardownDom();
});

function setup(locale: "en" | "pt-br") {
  // Italian: 6 games, 50% score. Sicilian: 4 games, 100%. French: 3 games, 0%.
  loaded = [
    ...many("i", "Italian Game", ["win", "win", "win", "loss", "loss", "loss"]),
    ...many("s", "Sicilian Defense: Najdorf Variation", ["win", "win", "win", "win"]),
    ...many("f", "French Defense", ["loss", "loss", "loss"]),
  ];
  useStudioStore.setState({
    user: { id: "u1" } as never,
    settings: { ...DEFAULT_SETTINGS, locale },
  });
  return render(<MyStatsPanel />);
}

function names(): string[] {
  return screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

beforeEach(() => cleanup());

test("renders a player-perspective bar per row, default sort by games", async () => {
  const { container } = setup("en");
  await waitFor(() => assert.ok(screen.getByText("Italian Game")));
  assert.deepEqual(names(), ["Italian Game", "Sicilian Defense: Najdorf Variation", "French Defense"]);
  const bars = container.querySelectorAll('table [data-perspective="player"]');
  assert.equal(bars.length, 3);
  assert.equal(bars[2]?.querySelector('[data-segment="loss"]') !== null, true);
  assert.equal(bars[1]?.querySelector('[data-segment="win"]') !== null, true);
});

test("sort by score reorders rows", async () => {
  setup("en");
  await waitFor(() => assert.ok(screen.getByText("Italian Game")));
  fireEvent.click(screen.getByRole("button", { name: "Score" }));
  assert.deepEqual(names(), ["Sicilian Defense: Najdorf Variation", "Italian Game", "French Defense"]);
});

test("min games filter drops small groups and shows the empty state", async () => {
  setup("en");
  await waitFor(() => assert.ok(screen.getByText("Italian Game")));
  fireEvent.click(screen.getByRole("button", { name: "5" }));
  assert.deepEqual(names(), ["Italian Game"]);
  fireEvent.click(screen.getByRole("button", { name: "10" }));
  assert.ok(screen.getByText("No Openings With Enough Games Yet."));
});

test("pt-BR displays the translated family and keeps the variation", async () => {
  setup("pt-br");
  await waitFor(() => assert.ok(screen.getByText("Jogo Italiano")));
  assert.ok(screen.getByText("Defesa Siciliana: Najdorf Variation"));
  assert.ok(screen.getByText("Defesa Francesa"));
});
