import { expect, test, type Locator, type Page } from "@playwright/test";
import { Chess } from "chess.js";

/**
 * SIG-945: end-to-end behaviour of the puzzle trainer.
 *
 * `Trainer.tsx` was split into the session/scoring/feedback hooks plus
 * `PuzzleBoard` and `PuzzlePanel`. These specs are the durable form of that
 * refactor's "zero behaviour change" claim: they drive a production build, so
 * the extracted modules are exercised together through the real UI rather
 * than through the exported pure helpers alone.
 *
 * Puzzle selection is random (a window of the four closest rated puzzles), so
 * each test reads the board's puzzle id, fetches that puzzle from
 * `/api/puzzles` and replays its line to work out the squares to click.
 */

interface ApiPuzzle {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
}

interface SquareMove {
  from: string;
  to: string;
}

function board(page: Page): Locator {
  return page.locator('[id^="puzzle-"][id$="-board"]');
}

function panel(page: Page): Locator {
  return page.locator("section").filter({ has: page.locator('[aria-live="polite"]') });
}

function bubbleTitle(page: Page): Locator {
  return panel(page).locator('[aria-live="polite"] p').first();
}

/**
 * The floating `+xp` pill. It is a sibling of the board root, not a
 * descendant, and the panel's xp bar reuses the same colour on a `div` — so
 * this is the only `span` carrying it on the page.
 */
function award(page: Page): Locator {
  return page.locator("span.bg-studio-success");
}

async function boardPuzzleId(page: Page): Promise<string> {
  const id = await board(page).getAttribute("id");
  if (!id) {
    throw new Error("puzzle board id not found");
  }
  return id.replace(/^puzzle-/, "").replace(/-board$/, "");
}

async function currentPuzzle(page: Page): Promise<ApiPuzzle> {
  const id = await boardPuzzleId(page);
  const response = await page.request.get(`/api/puzzles?id=${encodeURIComponent(id)}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ApiPuzzle;
}

/** The solver owns the even plies of a puzzle line, matching `userTurn`. */
function solverMoves(puzzle: ApiPuzzle): SquareMove[] {
  const chess = new Chess(puzzle.fen);
  return puzzle.moves
    .map((san, ply) => ({ ply, move: chess.move(san) }))
    .filter(({ ply }) => ply % 2 === 0)
    .map(({ move }) => ({ from: move.from, to: move.to }));
}

/** A legal move that is neither the solution nor a mate. */
function wrongMove(puzzle: ApiPuzzle): SquareMove {
  const [solution] = solverMoves(puzzle);
  const candidate = new Chess(puzzle.fen)
    .moves({ verbose: true })
    .find((move) => !move.san.endsWith("#") && !(move.from === solution.from && move.to === solution.to));
  if (!candidate) {
    throw new Error(`no wrong move available for ${puzzle.id}`);
  }
  return { from: candidate.from, to: candidate.to };
}

async function clickMove(page: Page, move: SquareMove): Promise<void> {
  await board(page).locator(`[data-square="${move.from}"]`).click();
  await board(page).locator(`[data-square="${move.to}"]`).click();
}

async function solve(page: Page, puzzle: ApiPuzzle): Promise<void> {
  const moves = solverMoves(puzzle);
  for (let index = 0; index < moves.length; index += 1) {
    await clickMove(page, moves[index]);
    if (index < moves.length - 1) {
      // The opponent reply lands ~340ms later; the move counter is the
      // observable signal that it has.
      await expect(panel(page)).toContainText(`Move ${index + 2} of ${moves.length}`);
    }
  }
}

async function openTrainer(page: Page, mode: string): Promise<void> {
  await page.goto(`/puzzles/play?mode=${mode}`);
  await expect(board(page)).toBeVisible();
}

/** Rush renders the remaining time as `m:ss`; nothing else in the panel matches. */
async function clockSeconds(page: Page): Promise<number> {
  const text = await panel(page).innerText();
  const match = text.match(/\b(\d):(\d\d)\b/);
  if (!match) {
    throw new Error("rush clock not found");
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

test("puzzle trainer: rated solve escalates hints, awards xp and advances", async ({ page }) => {
  await openTrainer(page, "rated");
  const trainer = panel(page);
  await expect(trainer).toContainText("Rated");
  await expect(bubbleTitle(page)).toHaveText(/^(White|Black) to move$/);

  const hint = trainer.getByRole("button", { name: "Hint" });
  await hint.click();
  await expect(bubbleTitle(page)).toHaveText(/^(White|Black) to move$/);
  await expect(trainer).toContainText("The piece to move is highlighted.");
  await hint.click();
  await expect(trainer).toContainText("The move is marked.");
  await expect(hint).toBeDisabled();

  const puzzle = await currentPuzzle(page);
  await solve(page, puzzle);

  await expect(bubbleTitle(page)).toHaveText("Solved");
  // xp for a first solve is 12 + round(puzzleRating / 40) + 8 for the streak.
  await expect(trainer).toContainText(`+${12 + Math.round(puzzle.rating / 40) + 8}`);
  await expect(award(page)).toHaveCount(1);
  await expect(award(page)).toHaveText(`+${12 + Math.round(puzzle.rating / 40) + 8}`);
  await expect(trainer).toContainText(/Rating [\d.,]+ \+\d+/);

  await trainer.getByRole("button", { name: "Next puzzle" }).click();
  await expect.poll(() => boardPuzzleId(page)).not.toBe(puzzle.id);
});

test("puzzle trainer: a rated miss names the best move and drops the rating", async ({ page }) => {
  await openTrainer(page, "rated");
  const trainer = panel(page);

  const puzzle = await currentPuzzle(page);
  await clickMove(page, wrongMove(puzzle));

  await expect(bubbleTitle(page)).toHaveText("Incorrect");
  await expect(trainer).toContainText("Best move:");
  await expect(trainer).toContainText(/Rating [\d.,]+ -\d+/);
  await expect(award(page)).toHaveCount(0);
});

test("puzzle trainer: rush counts down, ends after three misses and replays", async ({ page }) => {
  await openTrainer(page, "rush");
  const trainer = panel(page);
  await expect(trainer).toContainText("Rush");

  const started = await clockSeconds(page);
  expect(started).toBeGreaterThan(170);
  await page.waitForTimeout(2600);
  const elapsed = started - (await clockSeconds(page));
  expect(elapsed).toBeGreaterThanOrEqual(2);
  expect(elapsed).toBeLessThanOrEqual(4);

  for (let miss = 1; miss <= 3; miss += 1) {
    await clickMove(page, wrongMove(await currentPuzzle(page)));
    await expect(trainer.locator(`[aria-label="${miss} of 3 misses"]`)).toHaveCount(1);
    if (miss < 3) {
      // The next rush puzzle is queued ~900ms after a miss.
      await expect(bubbleTitle(page)).toHaveText(/^(White|Black) to move$/);
    }
  }

  await expect(bubbleTitle(page)).toHaveText("Three misses");
  await expect(trainer).toContainText("0 puzzles solved");
  await expect(trainer).toContainText("Best 0");

  await trainer.getByRole("button", { name: "Play again" }).click();
  await expect(trainer.locator('[aria-label="0 of 3 misses"]')).toHaveCount(1);
  expect(await clockSeconds(page)).toBeGreaterThan(170);
});

test("puzzle trainer: a streak miss ends the run", async ({ page }) => {
  await openTrainer(page, "streak");
  const trainer = panel(page);
  await expect(trainer).toContainText("Streak");

  await clickMove(page, wrongMove(await currentPuzzle(page)));

  await expect(bubbleTitle(page)).toHaveText("Streak over");
  await expect(trainer).toContainText("0 in a row · best 0");
  await expect(trainer.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("puzzle trainer: the daily puzzle solves and offers no continue button", async ({ page }) => {
  await openTrainer(page, "daily");
  const trainer = panel(page);
  await expect(trainer).toContainText("Daily puzzle");
  await expect(trainer.getByRole("button", { name: "Next puzzle" })).toHaveCount(0);

  await solve(page, await currentPuzzle(page));

  await expect(bubbleTitle(page)).toHaveText("Solved");
  await expect(trainer.getByRole("button", { name: "Next puzzle" })).toHaveCount(0);
  await expect(trainer.getByRole("link", { name: "Back to puzzles" })).toBeVisible();
});

/**
 * SIG-1179: a solved puzzle is never served again. This spec runs logged out,
 * so it exercises the anonymous localStorage seen path; the signed-in
 * server-side exclusion (puzzles_unseen RPC) is covered by route/store unit
 * tests. After solving, it advances through several puzzles and reloads,
 * asserting the solved id never reappears.
 */
test("puzzle trainer: a solved puzzle never reappears after advancing and reload", async ({ page }) => {
  await openTrainer(page, "rated");
  const trainer = panel(page);

  const first = await currentPuzzle(page);
  await solve(page, first);
  await expect(bubbleTitle(page)).toHaveText("Solved");

  const seen = new Set([first.id]);
  for (let step = 0; step < 5; step += 1) {
    await trainer.getByRole("button", { name: "Next puzzle" }).click();
    await expect.poll(() => boardPuzzleId(page)).not.toBe(first.id);
    const nextId = await boardPuzzleId(page);
    expect(seen.has(nextId)).toBe(false);
    seen.add(nextId);
    const next = await currentPuzzle(page);
    await solve(page, next);
    await expect(bubbleTitle(page)).toHaveText("Solved");
  }

  await page.reload();
  await expect(board(page)).toBeVisible();
  const afterReload = await boardPuzzleId(page);
  expect(seen.has(afterReload)).toBe(false);
});

/** SIG-1070: with the pt-br locale stored, /puzzles renders Portuguese. */
test("puzzles dashboard renders Portuguese with the pt-br locale stored", async ({ page, context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem("studio-clone-settings", JSON.stringify({ locale: "pt-br" }));
  });
  await page.goto("/puzzles");
  await expect(page.getByRole("heading", { name: "Problemas", level: 1 })).toBeVisible();
  await expect(page.getByText("Começar o treino")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Problema do dia" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sequência" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Começar sequência" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Começar rush" })).toBeVisible();
  await expect(page.getByText("Temas")).toBeVisible();
  await expect(page.getByText("Start training")).toHaveCount(0);
});
