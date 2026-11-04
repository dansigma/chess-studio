import { expect, test } from "@playwright/test";

/**
 * SIG-1199: a board closed with the `x` in the "Open boards" sidebar must stay
 * closed after a reload (guest path), and the active board is kept. The reload
 * happens right after the close, inside the old 400ms debounce window.
 */
test("closed boards do not reappear after a reload and the active board is kept", async ({
  page,
}) => {
  await page.goto("/studio");
  const board = page.locator("[data-board-image]");
  await expect(board.locator('[data-square="e2"]')).toBeVisible();

  const sidebar = page.getByRole("complementary");
  const rowFor = (text: string) =>
    sidebar.locator("div.group", { has: page.locator("button", { hasText: text }) });
  const closeButtons = sidebar.locator('button[aria-label="Close board"]');
  const newBoard = sidebar.getByRole("button", { name: "New board" });

  // Board 1 stays at the starting position; board 2 plays e4; board 3 plays d4.
  await newBoard.click();
  await board.locator('[data-square="e2"]').click();
  await board.locator('[data-square="e4"]').click();
  await expect(sidebar.getByText("e4", { exact: true })).toBeVisible();

  await newBoard.click();
  await board.locator('[data-square="d2"]').click();
  await board.locator('[data-square="d4"]').click();
  await expect(sidebar.getByText("d4", { exact: true })).toBeVisible();
  await expect(closeButtons).toHaveCount(3);

  // Focus board 1 (starting position), then close board 2 (e4) via its x.
  await sidebar.getByRole("button", { name: /starting position/ }).click();
  const e4Row = rowFor("e4");
  await e4Row.hover();
  await e4Row.locator('button[aria-label="Close board"]').click();
  await expect(closeButtons).toHaveCount(2);

  await page.reload();
  await expect(board.locator('[data-square="e2"]')).toBeVisible();

  await expect(closeButtons).toHaveCount(2);
  await expect(sidebar.getByText("e4", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByText("d4", { exact: true })).toBeVisible();
  const active = sidebar.locator('button[aria-current="true"]');
  await expect(active).toHaveCount(1);
  await expect(active).toContainText("starting position");
});
