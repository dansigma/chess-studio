import { expect, test } from "@playwright/test";

/**
 * SIG-1189: studio layout — panel gaps are tight (6px rhythm), both horizontal
 * dividers compute `cursor: col-resize`, and dragging either divider resizes.
 *
 * Conventions follow e2e/studio-move.spec.ts: goto /studio, assert real behavior.
 */
test.describe("studio layout: tight panel gaps and resize cursors", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("sidebar/board and board/notation groups are at most 6.5px apart", async ({
    page,
  }) => {
    await page.goto("/studio");
    const board = page.locator("[data-board-image]");
    await expect(board.locator('[data-square="e2"]')).toBeVisible();

    const handle = page.getByRole("separator", { name: "Resize sidebar" });
    await expect(handle).toBeVisible();

    const sidebar = page.locator("div.flex.h-full.shrink-0").first();
    const boardGroup = page.locator(".dv-groupview", { has: board }).first();
    const tabs = page.getByRole("tab").first();
    await expect(tabs).toBeVisible();
    const notationGroup = page.locator(".dv-groupview", { has: tabs }).first();

    const sidebarBox = await sidebar.boundingBox();
    const boardGroupBox = await boardGroup.boundingBox();
    const notationGroupBox = await notationGroup.boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(boardGroupBox).not.toBeNull();
    expect(notationGroupBox).not.toBeNull();
    if (!sidebarBox || !boardGroupBox || !notationGroupBox) return;

    expect(
      boardGroupBox.x - (sidebarBox.x + sidebarBox.width),
    ).toBeLessThanOrEqual(6.5);
    expect(
      notationGroupBox.x - (boardGroupBox.x + boardGroupBox.width),
    ).toBeLessThanOrEqual(6.5);

    // No horizontal page scroll.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("both horizontal dividers compute cursor col-resize", async ({ page }) => {
    await page.goto("/studio");
    const board = page.locator("[data-board-image]");
    await expect(board.locator('[data-square="e2"]')).toBeVisible();

    const handle = page.getByRole("separator", { name: "Resize sidebar" });
    await expect(handle).toBeVisible();
    expect(await handle.evaluate((el) => getComputedStyle(el).cursor)).toBe(
      "col-resize",
    );
    const lineCursor = await handle
      .locator("div")
      .first()
      .evaluate((el) => getComputedStyle(el).cursor);
    expect(lineCursor).toBe("col-resize");

    const sash = page.locator(
      ".dv-split-view-container.dv-horizontal .dv-sash",
    ).first();
    await expect(sash).toBeAttached();
    expect(await sash.evaluate((el) => getComputedStyle(el).cursor)).toBe(
      "col-resize",
    );
    const sashWidth = await sash.evaluate((el) => getComputedStyle(el).width);
    expect(parseFloat(sashWidth)).toBeLessThanOrEqual(6.5);
  });

  test("dragging the left handle widens the sidebar", async ({ page }) => {
    await page.goto("/studio");
    const board = page.locator("[data-board-image]");
    await expect(board.locator('[data-square="e2"]')).toBeVisible();

    const handle = page.getByRole("separator", { name: "Resize sidebar" });
    await expect(handle).toBeVisible();
    const sidebar = page.locator("div.flex.h-full.shrink-0").first();
    const before = await sidebar.boundingBox();
    expect(before).not.toBeNull();
    if (!before) return;

    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) return;
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 40, startY, { steps: 8 });
    await page.mouse.up();

    const after = await sidebar.boundingBox();
    expect(after).not.toBeNull();
    if (!after) return;
    expect(after.width - before.width).toBeGreaterThan(24);
    expect(after.width - before.width).toBeLessThan(56);
  });

  test("dragging the horizontal sash resizes the board group", async ({
    page,
  }) => {
    await page.goto("/studio");
    const board = page.locator("[data-board-image]");
    await expect(board.locator('[data-square="e2"]')).toBeVisible();

    const boardGroup = page.locator(".dv-groupview", { has: board }).first();
    const sash = page.locator(
      ".dv-split-view-container.dv-horizontal .dv-sash",
    ).first();
    await expect(sash).toBeAttached();

    const boardBefore = await boardGroup.boundingBox();
    const sashBox = await sash.boundingBox();
    expect(boardBefore).not.toBeNull();
    expect(sashBox).not.toBeNull();
    if (!boardBefore || !sashBox) return;

    const startX = sashBox.x + sashBox.width / 2;
    const startY = sashBox.y + sashBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 40, startY, { steps: 8 });
    await page.mouse.up();

    const boardAfter = await boardGroup.boundingBox();
    expect(boardAfter).not.toBeNull();
    if (!boardAfter) return;
    // Dragging the sash left shrinks the board side of the split.
    expect(boardAfter.width).toBeLessThan(boardBefore.width);
    expect(boardBefore.width - boardAfter.width).toBeGreaterThan(16);
  });

  test("1280x800: gaps stay tight with no horizontal scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/studio");
    const board = page.locator("[data-board-image]");
    await expect(board.locator('[data-square="e2"]')).toBeVisible();

    const sidebar = page.locator("div.flex.h-full.shrink-0").first();
    const boardGroup = page.locator(".dv-groupview", { has: board }).first();
    const tabs = page.getByRole("tab").first();
    await expect(tabs).toBeVisible();
    const notationGroup = page.locator(".dv-groupview", { has: tabs }).first();

    const sidebarBox = await sidebar.boundingBox();
    const boardGroupBox = await boardGroup.boundingBox();
    const notationGroupBox = await notationGroup.boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(boardGroupBox).not.toBeNull();
    expect(notationGroupBox).not.toBeNull();
    if (!sidebarBox || !boardGroupBox || !notationGroupBox) return;

    expect(
      boardGroupBox.x - (sidebarBox.x + sidebarBox.width),
    ).toBeLessThanOrEqual(6.5);
    expect(
      notationGroupBox.x - (boardGroupBox.x + boardGroupBox.width),
    ).toBeLessThanOrEqual(6.5);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
