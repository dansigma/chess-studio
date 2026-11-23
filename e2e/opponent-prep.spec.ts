import { expect, test, type Page } from "@playwright/test";

/**
 * SIG-1347: the Studio's Opponent prep panel is retired in favour of the
 * Library player dossier. Its menu entry is gone and the player-games
 * "Prepare against" shortcut opens the same player's dossier in Players mode.
 */

const PLAYER = {
  id: "lichess:drnykterstein",
  source: "lichess",
  username: "DrNykterstein",
  displayName: "DrNykterstein",
  subtitle: "Lichess",
};

async function mockPlayerApis(page: Page): Promise<void> {
  await page.route("**/api/players/search*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ players: [PLAYER] }) });
  });
  await page.route("**/api/players/games*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ games: [] }) });
  });
}

async function openPlayerInStudio(page: Page): Promise<void> {
  await page.goto("/studio");
  await page.getByRole("button", { name: "Library" }).first().click();
  await page.getByRole("tab", { name: "Players" }).click();
  const search = page.getByPlaceholder("Lichess, Chess.com, FIDE, or book…");
  await search.fill("DrNyk");
  await page.getByRole("button", { name: /DrNykterstein/ }).first().click();
  await page.getByRole("button", { name: "Open in Studio" }).click();
}

test("the Opponent prep panel is no longer offered in the Open panel menu", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open panel" }).hover();
  await expect(page.getByRole("menuitem", { name: "Opponent prep" })).toHaveCount(0);
  // Two menu surfaces can be mounted at once (desktop menu bar and the mobile
  // sheet), so "Notation" may resolve to more than one element; the check is
  // that the panel list is visible in the open menu.
  await expect(page.getByRole("menuitem", { name: "Notation" }).filter({ visible: true }).first()).toBeVisible();
});

test("Prepare against opens the player's dossier in the Library's Players mode", async ({ page }) => {
  await mockPlayerApis(page);
  await openPlayerInStudio(page);

  await page.getByRole("button", { name: "Prepare against", exact: true }).click();

  await expect(page.getByTestId("library-player-dossier")).toContainText("DrNykterstein");
  await expect(page.getByRole("tab", { name: "Players" })).toHaveAttribute("aria-selected", "true");
});

test("the search clear button has a 24x24 minimum hit target", async ({ page }) => {
  // SIG-1377: WCAG 2.2 SC 2.5.8. The clear glyph stays 10px; its box is 24px.
  await mockPlayerApis(page);
  await page.goto("/studio");
  await page.getByRole("button", { name: "Library" }).first().click();
  await page.getByRole("tab", { name: "Players" }).click();
  await page.getByPlaceholder("Lichess, Chess.com, FIDE, or book…").fill("DrNyk");

  const box = await page.getByRole("button", { name: "Clear search" }).first().boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(24);
  expect(box!.height).toBeGreaterThanOrEqual(24);
});

test("two Studio player panels follow the board and restore their independent filters", async ({ page }) => {
  const other = { ...PLAYER, id: "lichess:other", username: "Other", displayName: "Other" };
  await page.route("**/api/players/search*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    await route.fulfill({ json: { players: query === "Other" ? [other] : [PLAYER] } });
  });
  await page.route("**/api/players/games*", async (route) => {
    const username = new URL(route.request().url()).searchParams.get("username");
    const isOther = username === other.username;
    await route.fulfill({ json: { games: [{
      id: username, moves: isOther ? "d4 d5" : "e4 e5", playerResult: "win", color: "white",
      winner: "white", whiteName: username, blackName: isOther ? "Other opponent" : "First opponent",
      year: 2025, month: 6, playedAt: 1,
    }] } });
  });
  await page.goto("/studio");
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open panel" }).hover();
  await page.getByRole("menuitem", { name: "Player", exact: true }).filter({ visible: true }).click();
  await page.getByRole("textbox", { name: "Search for a player…" }).fill("DrNyk");
  await page.getByRole("button", { name: /DrNykterstein Lichess/ }).click();

  const first = page.locator(".dv-groupview", { has: page.getByRole("tab", { name: PLAYER.displayName, exact: true }) });
  await first.getByRole("button", { name: "Compare with another player" }).click();
  await page.getByRole("textbox", { name: "Search for a player…" }).fill("Other");
  await page.getByRole("button", { name: /Other Lichess/ }).click();
  const second = page.locator(".dv-groupview", { has: page.getByRole("tab", { name: other.displayName, exact: true }) });

  await first.getByRole("button", { name: "White", exact: true }).click();
  await first.getByRole("button", { name: "Won", exact: true }).click();
  await expect(second.getByRole("button", { name: "White", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(second.getByRole("button", { name: "Won", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(second.getByText("Other opponent")).toBeVisible();

  await page.reload();
  await expect(first.getByRole("button", { name: "White", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(first.getByRole("button", { name: "Won", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(second.getByRole("button", { name: "Won", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(first.getByText("First opponent")).toBeVisible();
  await first.getByRole("button", { name: /^e4\b/ }).click();
  await expect(first.getByText("First opponent")).toBeVisible();
  await expect(second.getByText("No games reached this position.")).toBeVisible();
});
