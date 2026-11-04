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
    // SIG-1189: the notation group is the group whose tab is "Notation"; the
    // first tab in the DOM belongs to the board group, which made the old
    // selector resolve to the board itself (negative gap, passing trivially).
    const notationTab = page.getByRole("tab", { name: "Notation" });
    await expect(notationTab).toBeVisible();
    const notationGroup = page.locator(".dv-groupview", { has: notationTab }).first();

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
    const notationTab = page.getByRole("tab", { name: "Notation" });
    await expect(notationTab).toBeVisible();
    const notationGroup = page.locator(".dv-groupview", { has: notationTab }).first();
    const sash = page.locator(
      ".dv-split-view-container.dv-horizontal .dv-sash",
    ).first();
    await expect(sash).toBeAttached();

    const boardBefore = await boardGroup.boundingBox();
    const notationBefore = await notationGroup.boundingBox();
    const sashBox = await sash.boundingBox();
    expect(boardBefore).not.toBeNull();
    expect(notationBefore).not.toBeNull();
    expect(sashBox).not.toBeNull();
    if (!boardBefore || !notationBefore || !sashBox) return;

    const startX = sashBox.x + sashBox.width / 2;
    const startY = sashBox.y + sashBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 40, startY, { steps: 8 });
    await page.mouse.up();

    const boardAfter = await boardGroup.boundingBox();
    const notationAfter = await notationGroup.boundingBox();
    expect(boardAfter).not.toBeNull();
    expect(notationAfter).not.toBeNull();
    if (!boardAfter || !notationAfter) return;
    // Dragging the sash left shrinks the board side and grows the notation
    // side by the same amount (the criterion asserts both ends of the split).
    expect(boardAfter.width).toBeLessThan(boardBefore.width);
    expect(boardBefore.width - boardAfter.width).toBeGreaterThan(16);
    expect(notationAfter.width).toBeGreaterThan(notationBefore.width);
    expect(notationAfter.width - notationBefore.width).toBeGreaterThan(16);
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
    // SIG-1189: the notation group is the group whose tab is "Notation"; the
    // first tab in the DOM belongs to the board group, which made the old
    // selector resolve to the board itself (negative gap, passing trivially).
    const notationTab = page.getByRole("tab", { name: "Notation" });
    await expect(notationTab).toBeVisible();
    const notationGroup = page.locator(".dv-groupview", { has: notationTab }).first();

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

/**
 * SIG-1201: the site sections moved from the brand popover to the activity
 * bar; the brand is plain branding.
 */
test.describe("studio site navigation (SIG-1201)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("activity bar links to Courses and Puzzles, Studio is current, brand opens no menu", async ({
    page,
  }) => {
    await page.goto("/studio");
    const group = page.getByRole("group", { name: "Xadrez Digital" });
    await expect(group.getByRole("link", { name: "Courses" })).toHaveAttribute("href", "/courses");
    await expect(group.getByRole("link", { name: "Puzzles" })).toHaveAttribute("href", "/puzzles");
    await expect(group.getByRole("link", { name: "Studio" })).toHaveAttribute("aria-current", "page");
    await expect(group.getByRole("link", { name: "Courses" })).not.toHaveAttribute("aria-current", "page");

    const brand = page.locator("div.z-\\[1000\\]").first().getByRole("link", { name: /Xadrez/ });
    await expect(brand).toHaveAttribute("href", "/");
    await expect(brand).not.toHaveAttribute("aria-haspopup", /.*/);
    await brand.click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    // "/" redirects back to /studio.
    await expect(page).toHaveURL(/\/studio$/);
  });
});
