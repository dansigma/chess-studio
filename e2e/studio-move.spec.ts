import { expect, test } from "@playwright/test";

/**
 * SIG-932: studio smoke — the guest board loads, a pawn push lands in the
 * notation as the active move, and the app stays on /studio.
 */
test("studio move: e2-e4 becomes the active notation move", async ({ page }) => {
  await page.goto("/studio");
  const board = page.locator('[data-board-image]');
  await expect(board.locator('[data-square="e2"]')).toBeVisible();

  await board.locator('[data-square="e2"]').click();
  await board.locator('[data-square="e4"]').click();

  // The played move becomes the active notation token.
  const active = page.locator('button[aria-current="step"]');
  await expect(active.first()).toContainText("e4");
  await expect(page).toHaveURL(/\/studio/);
});
