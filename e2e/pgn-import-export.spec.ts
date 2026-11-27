import { expect, test } from "@playwright/test";

/**
 * SIG-932: PGN round-trip — paste two short games via Library > Paste, open the
 * imported game onto the board, then copy the board PGN from the File menu.
 * SIG-1513: only the selected game is exported, never the rest of the database.
 */
const SHORT_GAME = `[Event "Smoke"]
[Site "e2e"]
[White "White"]
[Black "Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0`;

const TWO_GAMES = `[Event "Smoke"]
[Site "e2e"]
[White "Round Trip White"]
[Black "Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0

[Event "Second game"]
[White "Other White"]
[Black "Other Black"]

1. e4 c5 2. Nc3 *`;

test("opening one game from the clipboard loads the board without a games list", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/studio");
  await page.evaluate((pgn) => navigator.clipboard.writeText(pgn), SHORT_GAME);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open from clipboard" }).click();
  await expect(page.locator('[data-board-image] [data-square="f3"] [data-piece="wN"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Smoke", exact: true })).toHaveCount(0);
});

test("pgn import/export round-trips the selected game from a database", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/studio");
  const board = page.locator('[data-board-image]');
  await expect(board.locator('[data-square="e2"]')).toBeVisible();

  // SIG-1325: import through the Library toolbar, then open the game in the Studio.
  await page.getByRole("button", { name: "Library" }).first().click();
  await page.getByTestId("library-header").getByRole("button", { name: "Paste", exact: true }).click();
  await page.getByRole("textbox", { name: "PGN text" }).fill(TWO_GAMES);
  await page.getByRole("dialog").getByRole("button", { name: "Import", exact: true }).click();
  // The finished import widget sits over the preview's bottom-right; close it first.
  await page.getByTestId("library-import-widget").getByRole("button", { name: "Close" }).click();
  await page.getByTestId("library-row").filter({ hasText: "Round Trip White" }).click();
  await page.getByTestId("library-preview").getByRole("button", { name: "Open in Studio" }).click();

  // Switch to the notation to confirm the moves parsed into the active board.
  await page.getByRole("tab", { name: "Notation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nf3", exact: true })).toBeVisible();

  // File > Copy PGN puts parseable PGN on the clipboard.
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Copy PGN", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('[Event "Smoke"]');
  expect(copied).toContain("1. e4 e5 2. Nf3");
  expect(copied).not.toMatch(/c5|Nc3/);
});
