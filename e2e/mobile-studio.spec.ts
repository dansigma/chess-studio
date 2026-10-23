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
