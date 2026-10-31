import { expect, test } from "@playwright/test";

/**
 * SIG-1043: mobile studio slice 1/3 — at 390x844 the studio renders the
 * single-column mobile layout: no horizontal scroll, board visible at the
 * top, and a move strip that lists PGN moves and jumps on tap.
 */
const SHORT_GAME = `[Event "Smoke"]
[Site "e2e-mobile"]
[White "White"]
[Black "Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0`;

// SIG-1108: Ruy Lopez Breyer line (20 plies) so the deterministic fake review
// engine grades key moments; unique Event name avoids reviewCacheKey
// collisions with game-review.spec.ts fixtures.
const TABS_GAME = `[Event "Mobile Tabs"]
[Site "e2e-mobile"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 *`;

test("mobile studio: no h-scroll, board and move strip, tap jumps", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio");

  // Mobile layout mounts instead of the desktop dock.
  await expect(page.locator("[data-mobile-studio]")).toBeVisible();
  await expect(page.locator(".dockview-react")).toHaveCount(0);

  // No horizontal scroll at phone width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(overflow).toBe(true);

  // Board is fully visible near the top of the viewport.
  const board = page.locator("[data-mobile-studio] [data-board-image]");
  await expect(board.locator('[data-square="e2"]')).toBeVisible();
  const box = await board.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.width).toBeGreaterThan(300);

  // Load a PGN through the hidden file input (no sidebar on mobile).
  // openPgnSource lands the game on the active board via importPgnText;
  // openStudioPanel("fileGames") is a no-op without a registered dock.
  await page.locator('.studio-screen input[type="file"]').setInputFiles({
    name: "smoke.pgn",
    mimeType: "text/plain",
    buffer: Buffer.from(SHORT_GAME),
  });

  // The strip lists the moves.
  const strip = page.locator("[data-mobile-move-strip]");
  await expect(strip.getByRole("button", { name: "Nf3", exact: true })).toBeVisible();

  // Tapping a move jumps the board position: after jumping to e4 (ply 1)
  // the white pawn sits on e4, so the e4 square renders a white pawn piece
  // and e2 renders no white pawn — a direct board-position readback, not
  // just the strip marker.
  await strip.getByRole("button", { name: "e4", exact: true }).first().click();
  await expect(
    strip.getByRole("button", { name: "e4", exact: true }).first(),
  ).toHaveAttribute("aria-current", "step");
  const e4 = board.locator('[data-square="e4"]');
  const e2 = board.locator('[data-square="e2"]');
  await expect(e4.locator('[data-piece="wP"]')).toHaveCount(1);
  await expect(e2.locator('[data-piece="wP"]')).toHaveCount(0);

  // The move controls stay reachable: strip and status bar are both inside
  // the 844 px viewport (the mobile column fills the shell column instead
  // of stacking a full viewport below MenuBar + StatusBar).
  const stripBox = await strip.boundingBox();
  expect(stripBox).not.toBeNull();
  expect(stripBox!.y + stripBox!.height).toBeLessThanOrEqual(844);
  await expect(page.locator(".studio-screen > footer")).toBeVisible();
  const statusBox = await page.locator(".studio-screen > footer").boundingBox();
  expect(statusBox).not.toBeNull();
  expect(statusBox!.y + statusBox!.height).toBeLessThanOrEqual(844);
});

/**
 * SIG-1108: mobile studio slice 2/3 — the bottom tab bar switches between
 * the Moves, Engine, Review and Explorer panels; only the active panel is
 * mounted and none of them scrolls horizontally at 390 px.
 */
test("mobile studio: bottom tabs mount one panel at a time, no h-scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio");

  const studio = page.locator("[data-mobile-studio]");
  await expect(studio).toBeVisible();

  // Load a full game through the hidden file input (no sidebar on mobile).
  await page.locator('.studio-screen input[type="file"]').setInputFiles({
    name: "tabs.pgn",
    mimeType: "text/plain",
    buffer: Buffer.from(TABS_GAME),
  });

  const area = page.locator("[data-mobile-panel-area]");
  const tabbar = page.locator("[data-mobile-tabbar]");
  await expect(tabbar).toBeVisible();

  async function expectNoOverflow() {
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(pageOverflow).toBe(true);
    const areaOverflow = await area.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    );
    expect(areaOverflow).toBe(true);
  }

  // Moves (default tab) renders the notation panel.
  const movesTab = tabbar.getByRole("tab", { name: "Moves", exact: true });
  await expect(movesTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  await expect(area.getByRole("button", { name: "Start", exact: true })).toHaveCount(1);
  await expect(area.getByLabel("Review depth")).toHaveCount(0);
  await expect(area.getByLabel("Explorer source")).toHaveCount(0);
  await expectNoOverflow();

  // Engine tab renders the engine panel and shows evaluation lines.
  const engineTab = tabbar.getByRole("tab", { name: "Engine", exact: true });
  await engineTab.click();
  await expect(engineTab).toHaveAttribute("aria-selected", "true");
  await expect(movesTab).toHaveAttribute("aria-selected", "false");
  // The Engine panel starts paused; press play to analyze.
  await area.getByRole("button", { name: "Start engine", exact: true }).click();
  await expect(area.getByText(/^Evaluation /).first()).toBeVisible({ timeout: 60_000 });
  // Real engine lines render as PV rows once Stockfish reports.
  await expect(area.locator("[data-engine-pv]").first()).toBeVisible({ timeout: 60_000 });
  await expect(area.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
  await expect(area.getByLabel("Review depth")).toHaveCount(0);
  await expectNoOverflow();

  // Back on Moves, the engine panel is unmounted (lease never held elsewhere).
  await movesTab.click();
  await expect(movesTab).toHaveAttribute("aria-selected", "true");
  await expect(area.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  await expect(area.getByText(/^Evaluation /)).toHaveCount(0);
  await expectNoOverflow();

  // Explorer tab renders the explorer panel.
  const explorerTab = tabbar.getByRole("tab", { name: "Explorer", exact: true });
  await explorerTab.click();
  await expect(explorerTab).toHaveAttribute("aria-selected", "true");
  await expect(area.getByLabel("Explorer source")).toBeVisible();
  await expect(area.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
  await expect(area.getByLabel("Review depth")).toHaveCount(0);
  await expectNoOverflow();

  // Review tab runs the fake-engine review to completion and shows the report.
  const reviewTab = tabbar.getByRole("tab", { name: "Review", exact: true });
  await reviewTab.click();
  await expect(reviewTab).toHaveAttribute("aria-selected", "true");
  await expect(area.getByLabel("Review depth")).toBeVisible();
  await area.getByLabel("Review depth").selectOption("fast");
  await area.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(area.getByRole("button", { name: "Review again", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(area.getByText("Key moments", { exact: true }).first()).toBeVisible();
  await expectNoOverflow();
});
