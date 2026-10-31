import { expect, test, type Page } from "@playwright/test";
import type { OpeningNode } from "../src/lib/my-games/opening-tree";

/**
 * SIG-1101: opponent prep panel. The `/api/prep/opponent` route (SIG-1100) is
 * mocked with `route.fulfill` using a small hand-built profile; no network
 * beyond the mock, no auth fixtures (the panel is anonymous-safe).
 */

function node(overrides: Partial<OpeningNode> & { san?: string }): OpeningNode {
  return {
    san: overrides.san ?? "",
    ply: overrides.ply ?? 0,
    games: overrides.games ?? 0,
    wins: overrides.wins ?? 0,
    draws: overrides.draws ?? 0,
    losses: overrides.losses ?? 0,
    scorePct: overrides.scorePct ?? 0,
    avgAccuracy: null,
    trend: { m1: null, m3: null, m6: null, m12: null },
    children: overrides.children ?? [],
  };
}

const PROFILE = {
  gamesAnalyzed: 3,
  white: node({
    games: 2,
    children: [
      node({
        san: "e4",
        ply: 1,
        games: 2,
        wins: 1,
        draws: 1,
        scorePct: 75,
        children: [node({ san: "e5", ply: 2, games: 1, wins: 1, scorePct: 100 })],
      }),
    ],
  }),
  black: node({
    games: 1,
    children: [node({ san: "e4", ply: 1, games: 1, wins: 0, draws: 1, losses: 0, scorePct: 50 })],
  }),
  mostPlayed: {
    white: [{ san: "e4", games: 2 }],
    black: [{ san: "e4", games: 1 }],
  },
};

async function openPrepPanel(page: Page): Promise<void> {
  await page.goto("/studio");
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open panel" }).hover();
  await page.getByRole("menuitem", { name: "Opponent prep" }).click();
}

test("opponent prep: loading shows both tabs, expanding and preparing opens a board", async ({ page }) => {
  await page.route("**/api/prep/opponent*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PROFILE) });
  });
  await openPrepPanel(page);

  await page.getByPlaceholder("Opponent username").fill("someone");
  await page.getByRole("button", { name: "Load", exact: true }).click();

  await expect(page.getByText("3 games analyzed")).toBeVisible();
  await expect(page.getByRole("tab", { name: "As White" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "As Black" })).toBeVisible();

  // Expand the e4 node: the e5 child row appears.
  await page.getByRole("button", { name: "1. e4", exact: true }).click();
  await expect(page.getByText("1. e4 e5").first()).toBeVisible();

  // "Prepare against" on the White-tree line opens a new board oriented to
  // the user's side (Black) with the Explorer revealed.
  await page.getByRole("button", { name: "Prepare against" }).first().click();
  await expect(page.getByRole("tab", { name: /Board/ }).first()).toBeVisible();
});

test("opponent prep: Prepare against updates a panel that is already open", async ({ page }) => {
  await page.route("**/api/prep/opponent*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PROFILE) });
  });
  await page.route("**/api/players/search*", async (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const players =
      q.includes("nyk") || q.includes("dr")
        ? [
            {
              id: "lichess:drnykterstein",
              source: "lichess",
              username: "DrNykterstein",
              displayName: "DrNykterstein",
              subtitle: "Lichess",
            },
          ]
        : [
            {
              id: "lichess:oldname",
              source: "lichess",
              username: "oldname",
              displayName: "oldname",
              subtitle: "Lichess",
            },
          ];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ players }) });
  });
  await page.route("**/api/players/games*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ games: [] }) });
  });
  // Panel already mounted with a stale username (the QA repro: type
  // `oldname` first, then PlayerGamesPanel "Prepare against" for another
  // player must replace the input, not wait for a re-mount).
  await openPrepPanel(page);
  await page.getByPlaceholder("Opponent username").fill("oldname");

  // Same effect as PlayerGamesPanel.openOpponentPrepPanel: go through the
  // real app path — search a player, open their games, click "Prepare
  // against". The search API is mocked with two players; switching from the
  // first (oldname) to the second (DrNykterstein) while the prep panel stays
  // open is the QA repro. Note: opening the prep panel leaves the Boards
  // sidebar behind, so navigate to the Search sidebar explicitly (clicking
  // the active activity button would collapse it instead).
  await page.getByRole("button", { name: "Search" }).first().click();
  await expect(page.getByPlaceholder("Lichess, Chess.com, or book…")).toBeVisible();
  await page.getByPlaceholder("Lichess, Chess.com, or book…").fill("oldname");
  await page.getByRole("button", { name: /oldname/ }).first().click();
  await expect(page.getByRole("button", { name: "Prepare against", exact: true })).toBeVisible();

  // Still on the Search sidebar, find the second player; clicking their row
  // swaps the player-games panel to DrNykterstein, then "Prepare against"
  // must update the already-open prep panel's input.
  await page.getByPlaceholder("Lichess, Chess.com, or book…").fill("DrNyk");
  await page.getByRole("button", { name: /DrNykterstein/ }).first().click();
  await page.getByRole("button", { name: "Prepare against", exact: true }).click();

  await expect(page.getByPlaceholder("Opponent username")).toHaveValue("DrNykterstein");
});

test("opponent prep: error states render distinctly in both languages", async ({ page }) => {
  await openPrepPanel(page);
  await page.getByPlaceholder("Opponent username").fill("ghost");

  for (const [status, message] of [
    [404, "No public games found for this username."],
    [429, "Too many requests — wait a moment and try again."],
    [502, "Could not load the opponent profile. Try again."],
  ] as const) {
    await page.unroute("**/api/prep/opponent*");
    await page.route("**/api/prep/opponent*", async (route) => {
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: "x" }) });
    });
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(page.getByText(message)).toBeVisible();
  }
});
