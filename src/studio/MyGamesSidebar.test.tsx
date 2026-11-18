import assert from "node:assert/strict";
import { after, afterEach, before, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PlayerGame } from "../lib/player-types.ts";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings.ts";

let linkedAccountsResult: { ok: true; accounts: Array<{ source: "lichess" | "chesscom"; username: string }> } = {
  ok: true,
  accounts: [],
};

mock.module("@/src/lib/supabase/client", {
  namedExports: {
    createBrowserSupabase: () => ({}),
  },
});

mock.module("@/src/lib/my-games/linked-accounts", {
  namedExports: {
    loadLinkedAccounts: async () => linkedAccountsResult,
  },
});

mock.module("@/src/lib/my-games/load-games", {
  namedExports: {
    MY_GAMES_PAGE_SIZE: 25,
    loadMyGames: async () => ({
      ok: true,
      page: { games: [], hasMore: false, cursor: null },
    }),
  },
});

const { MyGamesRow, MyGamesSidebar } = await import("./MyGamesSidebar.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");

before(() => setupDom());
afterEach(() => {
  cleanup();
  linkedAccountsResult = { ok: true, accounts: [] };
});
after(() => teardownDom());

function sampleGame(overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id: "g-1",
    rowId: "row-1",
    winner: "white",
    whiteName: "Danilo",
    whiteRating: 1920,
    blackName: "OpponentName",
    blackRating: 1875,
    year: 2026,
    month: 10,
    event: null,
    eco: "C50",
    opening: "Italian Game",
    pgn: "1. e4 e5 2. Nf3 Nc6",
    timeClass: "blitz",
    color: "white",
    playerResult: "win",
    playedAt: 1,
    userAccuracy: 84.4,
    opponentAccuracy: 79.1,
    reviewedAt: "2026-10-01T00:00:00Z",
    mistakeCounts: null,
    ...overrides,
  };
}

function seedStore(locale: "en" | "pt-br" = "en", gamePreviewEnabled = false) {
  act(() => {
    useStudioStore.setState({
      user: { id: "u1", email: "user@example.com" },
      settings: { ...DEFAULT_SETTINGS, locale, gamePreviewEnabled },
      settingsDialog: { open: false, section: null },
    });
  });
}

test("MyGamesRow renders opponent name/rating, color indicator, no nested buttons, and fix CTA does not open the game", () => {
  seedStore("en", false);
  let openCalls = 0;
  let openNewCalls = 0;
  let fixCalls = 0;

  const { container } = render(
    <MyGamesRow
      game={sampleGame({ color: "white", blackName: "Kasparov", blackRating: 2812 })}
      locale="en"
      checked={false}
      disabled={false}
      badge="You deviated on move 6"
      fix={{
        label: "Train this line",
        kind: "user_deviation",
        event: {
          kind: "user_deviation",
          ply: 11,
          fen: "start",
          playedUci: "d2d3",
          playedSan: "d3",
          repertoireMoves: [{ uci: "c2c3", san: "c3" }],
        },
      }}
      repMissing={false}
      onToggleSelect={() => {}}
      onOpen={() => {
        openCalls += 1;
      }}
      onOpenNew={() => {
        openNewCalls += 1;
      }}
      onFix={() => {
        fixCalls += 1;
      }}
    />,
  );

  assert.equal(container.querySelectorAll("button button").length, 0, "must never nest a button inside a button");
  assert.ok(screen.getByText("Kasparov"));
  assert.ok(screen.getByText("2812"));
  assert.equal(screen.queryByText("Danilo"), null, "row should show opponent, not user");
  assert.ok(screen.getByRole("img", { name: "Played as White" }));
  assert.ok(screen.getByText("84%"));
  assert.ok(screen.getByLabelText("Accuracy 84%"));
  assert.ok(screen.getByText("You deviated on move 6"));

  fireEvent.click(screen.getByRole("button", { name: "Train this line" }));
  assert.equal(fixCalls, 1);
  assert.equal(openCalls, 0);
  assert.equal(openNewCalls, 0);
});

test("MyGamesRow shows white opponent when user played black and renders accuracy in PT-BR", () => {
  seedStore("pt-br", false);
  render(
    <MyGamesRow
      game={sampleGame({
        color: "black",
        whiteName: "Carlsen",
        whiteRating: 2830,
        blackName: "Danilo",
        blackRating: 1920,
        userAccuracy: 84.2,
      })}
      locale="pt-br"
      checked={false}
      disabled={false}
      badge={null}
      fix={null}
      repMissing={false}
      onToggleSelect={() => {}}
      onOpen={() => {}}
      onOpenNew={() => {}}
      onFix={() => {}}
    />,
  );

  assert.ok(screen.getByText("Carlsen"));
  assert.ok(screen.getByText("2830"));
  assert.ok(screen.getByRole("img", { name: "Jogou de Pretas" }));
  assert.ok(screen.getByText("84%"));
  assert.ok(screen.getByLabelText("Precisão 84%"));
});

test("MyGamesRow omits accuracy badge when userAccuracy is null", () => {
  seedStore("en", false);
  render(
    <MyGamesRow
      game={sampleGame({ userAccuracy: null })}
      locale="en"
      checked={false}
      disabled={false}
      badge={null}
      fix={null}
      repMissing={false}
      onToggleSelect={() => {}}
      onOpen={() => {}}
      onOpenNew={() => {}}
      onFix={() => {}}
    />,
  );

  assert.equal(screen.queryByText(/%/), null);
});

test("MyGamesSidebar linkAccount empty state button opens SettingsDialog on linkedAccounts", async () => {
  seedStore("en", false);
  linkedAccountsResult = { ok: true, accounts: [] };

  render(<MyGamesSidebar />);

  const button = await waitFor(() =>
    screen.getByRole("button", { name: "Open Linked accounts" }),
  );
  fireEvent.click(button);

  assert.deepEqual(useStudioStore.getState().settingsDialog, {
    open: true,
    section: "linkedAccounts",
  });
});
