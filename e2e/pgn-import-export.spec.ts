import { expect, test } from "@playwright/test";

/**
 * SIG-932: PGN round-trip — paste a short game via Files > Add, assert the
 * moves show in the notation, then copy the board PGN from the File menu.
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

  // Sidebar defaults to Boards — switch to Files, then Add > Paste PGN…
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Paste PGN/ }).click();
  await page.locator("textarea").fill(SHORT_GAME);
  await page.getByRole("button", { name: "Import", exact: true }).click();

  // Imported game lands in the notation (Nf3 token somewhere on the line).
  await expect(page.getByText("Nf3", { exact: false }).first()).toBeVisible();

  // File > Copy PGN puts parseable PGN on the clipboard.
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Copy PGN", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("1. e4 e5 2. Nf3");
});
