import { expect, test } from "@playwright/test";

/**
 * SIG-970: Game Review e2e — deterministic via the guarded fake engine seam
 * (`NEXT_PUBLIC_E2E_REVIEW_FAKE=1` in `playwright.config.ts` webServer.env).
 *
 * The fake scores flat +0.2 everywhere except ply 7 (-2.8) and ply 12 (+3.2),
 * so every fixture below deterministically grades into key moments.
 *
 * Each test uses a unique move line so `reviewCacheKey(fens, ...)` never
 * collides across tests (fresh contexts share the prod build origin).
 */

const HEADERS = (event: string) => `[Event "${event}"]
[Site "e2e"]
[White "White"]
[Black "Black"]
[Result "*"]`;

// 20 plies — Ruy Lopez Breyer line ending in Nbd7.
const RUN_GAME = `${HEADERS("Review Run")}

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 *`;

// 19 plies — same stem, white ends with d3 instead of d4 (unique fens).
const CANCEL_GAME = `${HEADERS("Review Cancel")}

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d3 *`;

// 19 plies — same stem, white ends with a4 (unique fens).
const MOMENTS_GAME = `${HEADERS("Review Moments")}

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. a4 *`;

async function importGame(
  page: import("@playwright/test").Page,
  pgn: string,
  title: string,
) {
  await page.goto("/studio");
  const board = page.locator("[data-board-image]");
  await expect(board.locator('[data-square="e2"]')).toBeVisible();

  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Paste PGN/ }).click();
  await page.locator("textarea").fill(pgn);
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await page.getByRole("button", { name: title, exact: true }).click();
  await page.getByRole("tab", { name: "Game Review", exact: true }).click();
  await expect(page.getByLabel("Review depth")).toBeVisible();
  await page.getByLabel("Review depth").selectOption("fast");
}

test("review run shows progress then the report and chart", async ({ page }) => {
  await importGame(page, RUN_GAME, "Review Run");

  await page.getByRole("button", { name: "Review game", exact: true }).click();

  const progress = page.getByRole("progressbar", { name: "Review progress" });
  await expect(progress).toBeVisible();

  // Completion: the run button flips to "Review again" and the report renders.
  await expect(page.getByRole("button", { name: "Review again", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Key moments", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /Review evaluation chart/ })).toBeVisible();
});

test("review cancel stops the run and offers resume", async ({ page }) => {
  await importGame(page, CANCEL_GAME, "Review Cancel");

  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "Review progress" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText(/Review cancelled at \d+\/\d+ positions\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: /Resume review/ })).toBeVisible();
});

test("key-moment navigation shows the Why? explanation", async ({ page }) => {
  await importGame(page, MOMENTS_GAME, "Review Moments");

  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review again", exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const next = page.getByRole("button", { name: "Next moment", exact: true });
  const prev = page.getByRole("button", { name: "Previous moment", exact: true });
  // Opening the game leaves the cursor at the end of the line, past the last
  // key moment — so Previous is the enabled direction. Either way, walk to a
  // moment; the Why? block follows the board.
  if (await next.isEnabled()) {
    await next.click();
  } else {
    await expect(prev).toBeEnabled();
    await prev.click();
  }

  await expect(page.getByText("Why?", { exact: true }).first()).toBeVisible();
});

test.fixme("language switch re-renders the completed report", async () => {
  // SIG-970 follow-up: flip site language (Settings > Site language) with a
  // completed review on board and assert localized panel/report strings.
});

test.fixme("reload restores the completed review from persistence", async () => {
  // SIG-970 follow-up (SIG-965): complete a review, reload /studio, and assert
  // the cached report hydrates without re-running the engine.
});
