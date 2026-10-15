import { expect, test } from "@playwright/test";

/**
 * SIG-932: PGN round-trip — paste a short game via Files > Add, open the
 * imported game onto the board, then copy the board PGN from the File menu.
 */
const SHORT_GAME = `[Event "Smoke"]
[Site "e2e"]
[White "White"]
[Black "Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0`;
const GAME_TITLE = "Smoke";

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

  // The imported database lists the game in the Games panel; open it so the
  // moves land on the board (import alone only files the game away).
  await page.getByRole("button", { name: GAME_TITLE, exact: true }).click();
  // Opening the game selects the Games tab in the side dock — switch to the
  // notation to confirm the moves parsed into the active board.
  await page.getByRole("tab", { name: "Notation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nf3", exact: true })).toBeVisible();

  // File > Copy PGN puts parseable PGN on the clipboard.
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Copy PGN", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("1. e4 e5 2. Nf3");
});
