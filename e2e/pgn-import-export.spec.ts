import { expect, test } from "@playwright/test";

/**
 * SIG-932: PGN round-trip — paste a short game via Library > + Import PGN > Paste PGN, open the
 * imported game onto the board, then copy the board PGN from the File menu.
 */
const SHORT_GAME = `[Event "Smoke"]
[Site "e2e"]
[White "White"]
[Black "Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0`;

test("pgn import/export round-trips a short game", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/studio");
  const board = page.locator('[data-board-image]');
  await expect(board.locator('[data-square="e2"]')).toBeVisible();

  // SIG-1325: import through the Library (+ Import PGN > Paste PGN), then open the game in the Studio.
  await page.getByRole("button", { name: "Library" }).first().click();
  await page.getByRole("button", { name: "+ Import PGN" }).click();
  await page.getByRole("menuitem", { name: "Paste PGN" }).click();
  await page.getByRole("textbox", { name: "PGN text" }).fill(SHORT_GAME);
  await page.getByRole("dialog").getByRole("button", { name: "Import", exact: true }).click();
  // The finished import widget sits over the preview's bottom-right; close it first.
  await page.getByTestId("library-import-widget").getByRole("button", { name: "Close" }).click();
  await page.getByTestId("library-row").first().click();
  await page.getByRole("button", { name: "Open in Studio" }).click();

  // Switch to the notation to confirm the moves parsed into the active board.
  await page.getByRole("tab", { name: "Notation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nf3", exact: true })).toBeVisible();

  // File > Copy PGN puts parseable PGN on the clipboard.
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Copy PGN", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("1. e4 e5 2. Nf3");
});
