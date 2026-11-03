import { expect, test } from "@playwright/test";

/**
 * SIG-1187: Forward at a branching position opens a continuation chooser
 * instead of silently following the mainline.
 */
async function playSquares(
  page: import("@playwright/test").Page,
  board: import("@playwright/test").Locator,
  squares: string[],
) {
  for (const square of squares) {
    await board.locator(`[data-square="${square}"]`).click();
  }
}

test("forward at a branch opens the chooser and follows the pick", async ({
  page,
}) => {
  await page.goto("/studio");
  const board = page.locator("[data-board-image]");
  await expect(board.locator('[data-square="e2"]')).toBeVisible();

  // 1. e4 e5, then back to 1. e4 and diverge with 1... c5 so path [0] has
  // two continuations (e5 mainline plus the c5 variation).
  await playSquares(page, board, ["e2", "e4", "e7", "e5"]);
  await expect(
    page.locator('button[aria-current="step"]', { hasText: "e5" }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await expect(
    page.locator('button[aria-current="step"]', { hasText: "e4" }).first(),
  ).toBeVisible();

  // Play 1... c5 as a variation of 1. e4's continuations.
  await playSquares(page, board, ["c7", "c5"]);
  const activeAfterC5 = await page
    .locator('button[aria-current="step"]')
    .first()
    .textContent();
  expect(activeAfterC5).toContain("c5");

  // Back to 1. e4 (path [0]), then ArrowRight must open the chooser.
  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await expect(
    page.locator('button[aria-current="step"]', { hasText: "e4" }).first(),
  ).toBeVisible();

  await page.keyboard.press("ArrowRight");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Choose a continuation" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: /e5/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /c5/ })).toBeVisible();
  // Board stays on e4: neither continuation is the active token.
  await expect(
    page.locator('button[aria-current="step"]', { hasText: "e5" }),
  ).toHaveCount(0);
  await expect(
    page.locator('button[aria-current="step"]', { hasText: "c5" }),
  ).toHaveCount(0);

  // Pick the variation (c5).
  await dialog.getByRole("button", { name: /c5/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator('button[aria-current="step"]', { hasText: "c5" }).first(),
  ).toBeVisible();
});

test("forward with a single child advances without a dialog", async ({
  page,
}) => {
  await page.goto("/studio");
  const board = page.locator("[data-board-image]");
  await expect(board.locator('[data-square="e2"]')).toBeVisible();

  await playSquares(page, board, ["e2", "e4"]);
  await page.getByRole("button", { name: "Start", exact: true }).first().click();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator('button[aria-current="step"]', { hasText: "e4" }).first(),
  ).toBeVisible();
});
