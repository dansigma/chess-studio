import { Chess } from "chess.js";
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

// 19 plies — same stem, white ends with Nc3 (unique fens).
const TRAIN_GAME = `${HEADERS("Review Train")}

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. Nbd2 *`;

// 19 plies — same stem, white ends with Bc2 (unique fens). The fake engine
// makes 4.Ba4, 4...Nf6, 6...b5 and 7.Bb3 key moments (both sides).
const RETRY_GAME = `${HEADERS("Review Retry")}

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. Bc2 *`;

// 19 plies — same stem, white ends with Qe2 (unique fens).
const BADGE_GAME = `${HEADERS("Review Badges")}

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. Qe2 *`;


// 19 plies with Lichess-style clocks (180+2); the same stem as the other games
// but ending Re2, so its fens are unique.
const CLOCK_GAME = `[Event "Review Clocks"]
[Site "e2e"]
[White "White"]
[Black "Black"]
[Result "*"]
[TimeControl "180+2"]

1. e4 { [%clk 0:02:58.0] } e5 { [%clk 0:02:59.2] } 2. Nf3 { [%clk 0:02:57.3] } Nc6 { [%clk 0:02:59.4] } 3. Bb5 { [%clk 0:02:56.0] } a6 { [%clk 0:02:50.0] } 4. Ba4 { [%clk 0:02:30.0] } Nf6 { [%clk 0:02:51.9] } 5. O-O { [%clk 0:02:31.9] } Be7 { [%clk 0:02:40.0] } 6. Re1 { [%clk 0:02:20.5] } b5 { [%clk 0:01:40.0] } 7. Bb3 { [%clk 0:02:19.0] } d6 { [%clk 0:01:39.0] } 8. c3 { [%clk 0:02:18.0] } O-O { [%clk 0:01:38.0] } 9. h3 { [%clk 0:02:17.0] } Nb8 { [%clk 0:01:37.0] } 10. Re2 { [%clk 0:02:16.0] } *`;

/** Depth lives in the "⋯" actions menu (SIG-1205). */
async function selectDepth(page: import("@playwright/test").Page | import("@playwright/test").Locator, name: string) {
  await page.getByRole("button", { name: "Review actions", exact: true }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${name}`) }).click();
}

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
  await selectDepth(page, "Fast");
}

test("actions menu: depth radios, report items disabled until a report exists, no share row", async ({ page }) => {
  await importGame(page, RUN_GAME, "Review Run");
  await expect(page.getByText(/Reviews every move with the engine/)).toBeVisible();

  await page.getByRole("button", { name: "Review actions", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Review actions" });
  await expect(menu.getByRole("menuitemradio", { name: /^Fast/ })).toHaveAttribute("aria-checked", "true");
  for (const name of ["Annotate game", "Undo annotations", "Copy report image", "Download report image", "Copy summary"]) {
    await expect(menu.getByRole("menuitem", { name, exact: true })).toBeDisabled();
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review again", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Share", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Details", exact: true })).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "Review actions", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Copy summary", exact: true })).toBeEnabled();
  await page.getByRole("menuitem", { name: "Annotate game", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

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
  // SIG-1207: both-player verdict (placeholder names fall back to the colors).
  await expect(page.locator("[data-verdict]")).toHaveText(
    /^White \d+\.\d%, Black \d+\.\d%\. The game turned on move \d+ \([A-Za-z0-9+#=-]+\?\??\)\.$/,
  );
  await expect(page.locator("[data-accuracy-bar]")).toHaveCount(2);
});

test("SIG-1219: tier counts jump to the move, and the badge shows on the board and in the move list", async ({ page }) => {
  await importGame(page, BADGE_GAME, "Review Badges");
  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review again", exact: true })).toBeVisible({ timeout: 30_000 });

  // The full table is visible without opening Details, with one badge per tier.
  const table = page.locator("[data-classification=table]");
  await expect(table.locator("[data-tier-badge]")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "Details", exact: true })).toHaveAttribute("aria-expanded", "false");

  // Every count click lands on a blunder: the board shows the blunder badge on the destination square.
  const blunders = table.locator("button[data-tier-count=blunder]").first();
  await blunders.click();
  const boardBadge = page.locator("[data-board-image] [data-board-tier-badge=blunder]");
  await expect(boardBadge).toHaveCount(1);
  await expect(boardBadge).toHaveCSS("pointer-events", "none");
  const square = boardBadge.locator("xpath=ancestor::*[@data-square][1]");
  await expect(square).toHaveAttribute("data-square", /^[a-h][1-8]$/);
  const firstSquare = (await square.getAttribute("data-square")) ?? "";
  // A second click cycles to the next blunder (another destination square).
  await blunders.click();
  await expect(square).not.toHaveAttribute("data-square", firstSquare);

  // The move list carries the same badge next to the current (reviewed) move.
  await page.getByRole("tab", { name: "Notation", exact: true }).click();
  const current = page.locator('[aria-current="step"]').first();
  await expect(current).toBeVisible();
  await expect(current.locator("[data-tier-badge=blunder]")).toHaveCount(1);
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

test("key-moment navigation shows the Why? explanation inline under the active row (SIG-1208)", async ({ page }) => {
  await importGame(page, MOMENTS_GAME, "Review Moments");

  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review again", exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // The board starts at the end of the game, which is not a key moment: no
  // inline explanation, just the collapsed "Current move" row.
  await expect(page.getByRole("region", { name: "Why?", exact: true })).toHaveCount(0);
  const current = page.getByRole("button", { name: /^Current move/ });
  await expect(current).toHaveAttribute("aria-expanded", "false");

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

  // The explanation sits inside the key-moments list, under the active row.
  const active = page.locator('li > button[aria-current="true"]');
  await expect(active).toHaveCount(1);
  const why = page.getByRole("region", { name: "Why?", exact: true });
  await expect(why).toBeVisible();
  await expect(page.getByRole("group", { name: "Key moments" }).getByRole("region", { name: "Why?" })).toHaveCount(1);
  // One line per row: eval before -> after is on the button.
  await expect(active).toContainText("→");

  // Clicking the active row collapses the explanation, clicking again reopens it.
  await active.click();
  await expect(why).toHaveCount(0);
  await active.click();
  await expect(why).toBeVisible();

  // On a key moment the standalone "Current move" row is gone.
  await expect(current).toHaveCount(0);
});

test("a fresh review offers to train the captured mistakes (SIG-1206)", async ({ page }) => {
  await importGame(page, TRAIN_GAME, "Review Train");

  const banner = page.getByTestId("train-mistakes-banner");
  await expect(banner).toHaveCount(0);

  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review again", exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // The side follows the board orientation (white by default).
  await expect(banner).toContainText(/\d+ of White's mistakes? became (an exercise|exercises)/);
  const link = banner.getByRole("link", { name: "Train now" });
  await expect(link).toHaveAttribute("href", "/puzzles/play?mode=mistakes");

  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toHaveCount(0);
});

/** The fake engine's best move: the last legal move in chess.js order. */
function fakeBestMove(sans: string[]): { from: string; to: string; san: string } {
  const chess = new Chess();
  for (const san of sans) {
    chess.move(san);
  }
  const moves = chess.moves({ verbose: true });
  const last = moves[moves.length - 1];
  return { from: last.from, to: last.to, san: last.san };
}

async function clickMove(page: import("@playwright/test").Page, from: string, to: string) {
  await page.locator(`[data-board-image] [data-square="${from}"]`).click();
  await page.locator(`[data-board-image] [data-square="${to}"]`).click();
}

/** Text of the notation panel: the nearest ancestor of the active step holding the whole move list. */
async function notationText(page: import("@playwright/test").Page) {
  return page.locator('button[aria-current="step"]').evaluate((el) => {
    let node: HTMLElement | null = el.parentElement;
    while (node && node.querySelectorAll("button").length < 15) {
      node = node.parentElement;
    }
    return node?.innerText ?? "";
  });
}

/**
 * SIG-1316: Notation and Game Review are tabs in the same dock group in the
 * default layout, so read the notation and come back to the review tab.
 */
async function notationTextFromReview(page: import("@playwright/test").Page) {
  await page.getByRole("tab", { name: "Notation", exact: true }).click();
  const text = await notationText(page);
  await page.getByRole("tab", { name: "Game Review", exact: true }).click();
  return text;
}

async function storedExercises(page: import("@playwright/test").Page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("xd-mistake-exercises") ?? "{}") as Record<
    string,
    { exercise: { playedUci: string; fromOpponent?: boolean }; srs: { mistakeCount: number } | null }
  >);
}

test("retry a mistake in place: wrong move reverts, solving records, engine is hidden, Exit restores (SIG-1209)", async ({ page }) => {
  await importGame(page, RETRY_GAME, "Review Retry");
  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review again", exact: true })).toBeVisible({ timeout: 30_000 });

  const boardImage = page.locator("[data-board-image]");
  // SIG-1316: Notation shares a dock group with Game Review; show it.
  await page.getByRole("tab", { name: "Notation", exact: true }).click();
  const activeStep = page.locator('button[aria-current="step"]');
  await expect(boardImage).toHaveAttribute("data-orientation", "white");
  await expect(activeStep).toContainText("Bc2");
  const notationBefore = await notationText(page);
  expect(notationBefore).toContain("Bc2");
  await page.getByRole("tab", { name: "Game Review", exact: true }).click();

  // Open the retry for White's 4.Ba4 (a mistake of the user's side).
  await page.getByRole("button", { name: "Retry move 4, Ba4", exact: true }).click();
  const card = page.locator("[data-retry-card]");
  await expect(card).toContainText("White to play · Blunder on move 4");
  await expect(card.getByText("Find the best move.")).toBeVisible();
  // The report summary and the engine's "best:" hints are gone during the retry.
  await expect(page.getByRole("group", { name: "Key moments" })).not.toContainText("best:");
  await expect(page.getByRole("region", { name: "Why?", exact: true })).toHaveCount(0);
  // The board shows the position before the mistake: the game move is not on it.
  await expect(boardImage.locator('[data-square="a4"] [role="button"]')).toHaveCount(0);
  await expect(boardImage.locator('[data-square="b5"] [role="button"]')).toHaveCount(1);

  // The engine panel is replaced by the hidden message.
  await page.getByRole("tab", { name: "Engine", exact: true }).click();
  await expect(page.getByText("Engine paused during the retry")).toBeVisible();
  await page.getByRole("tab", { name: "Game Review", exact: true }).click();
  await expect(card).toBeVisible();

  const best = fakeBestMove(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);

  // A wrong move shows for a moment, then reverts; the tree and notation do not change.
  await clickMove(page, "d2", "d3");
  await expect(card.getByText("Not this one. Try again.")).toBeVisible();
  await expect(boardImage.locator('[data-square="d2"] [role="button"]')).toHaveCount(1, { timeout: 3_000 });
  await expect(boardImage.locator('[data-square="d3"] [role="button"]')).toHaveCount(0);
  expect(await notationTextFromReview(page)).toBe(notationBefore);
  // The first wrong move is recorded immediately as a miss.
  await expect
    .poll(async () => Object.values(await storedExercises(page)).find((entry) => entry.exercise.playedUci === "b5a4")?.srs?.mistakeCount)
    .toBe(1);

  // The game move gets its own message.
  await clickMove(page, "b5", "a4");
  await expect(card.getByText("That was the game move. Try another.")).toBeVisible();
  await expect(boardImage.locator('[data-square="a4"] [role="button"]')).toHaveCount(0, { timeout: 3_000 });

  // The correct move solves it; the earlier miss stays the one record.
  await clickMove(page, best.from, best.to);
  await expect(card.getByText("Solved. It will come back in your review.")).toBeVisible();
  expect(await notationTextFromReview(page)).toBe(notationBefore);
  const afterSolve = await storedExercises(page);
  expect(Object.values(afterSolve).find((entry) => entry.exercise.playedUci === "b5a4")?.srs?.mistakeCount).toBe(1);

  // Next mistake: the opponent's 4...Nf6, so the board flips to Black.
  await card.getByRole("button", { name: "Next mistake", exact: true }).click();
  await expect(card).toContainText("Black to play · Blunder on move 4");
  await expect(boardImage).toHaveAttribute("data-orientation", "black");
  const reply = fakeBestMove(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4"]);
  await clickMove(page, reply.from, reply.to);
  await expect(card.getByText(`Correct! ${reply.san} was best.`)).toBeVisible();
  await expect
    .poll(async () => Object.values(await storedExercises(page)).find((entry) => entry.exercise.playedUci === "g8f6"))
    .toMatchObject({ exercise: { fromOpponent: true }, srs: { mistakeCount: 0 } });

  // Exit puts the board back where it was, with its orientation.
  await card.getByRole("button", { name: "Exit", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(boardImage).toHaveAttribute("data-orientation", "white");
  await page.getByRole("tab", { name: "Notation", exact: true }).click();
  await expect(activeStep).toContainText("Bc2");
  expect(await notationText(page)).toBe(notationBefore);
  await page.getByRole("tab", { name: "Game Review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry move 4, Ba4", exact: true })).toBeVisible();

  // Retrying the same exercise later the same day is free practice.
  await page.getByRole("button", { name: "Retry move 4, Ba4", exact: true }).click();
  await expect(card.getByText("Already counted today. Free practice.")).toBeVisible();
  // Esc leaves the retry too.
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await page.getByRole("tab", { name: "Notation", exact: true }).click();
  await expect(activeStep).toContainText("Bc2");
});

test.fixme("language switch re-renders the completed report", async () => {
  // SIG-970 follow-up: flip site language (Settings > Site language) with a
  // completed review on board and assert localized panel/report strings.
});

test.fixme("reload restores the completed review from persistence", async () => {
  // SIG-970 follow-up (SIG-965): complete a review, reload /studio, and assert
  // the cached report hydrates without re-running the engine.
});

test("SIG-1220: a game with clocks shows the Time section and the Evaluation | Time chart toggle; one without does not", async ({ page }) => {
  await importGame(page, CLOCK_GAME, "Review Clocks");
  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review again", exact: true })).toBeVisible({ timeout: 30_000 });
  const time = page.locator("[data-report-section=time]");
  await expect(time).toBeVisible();
  await expect(time.locator("[data-time-row=pace]")).toBeVisible();
  const toggle = page.locator("[data-chart-mode-toggle]");
  await expect(toggle).toBeVisible();
  await toggle.locator("[data-mode=time]").click();
  await expect(page.locator("[data-chart-mode=time]")).toBeVisible();
  await expect(page.locator("[data-time-bar]").first()).toBeVisible();
  await toggle.locator("[data-mode=eval]").click();
  await expect(page.locator("[data-chart-mode=eval]")).toBeVisible();
});

test("SIG-1220: a game without clocks renders no Time section and no chart toggle", async ({ page }) => {
  await importGame(page, RUN_GAME, "Review Run");
  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review again", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-report-card]")).toBeVisible();
  await expect(page.locator("[data-report-section=time]")).toHaveCount(0);
  await expect(page.locator("[data-chart-mode-toggle]")).toHaveCount(0);
  await expect(page.locator("[data-time-marker]")).toHaveCount(0);
});
