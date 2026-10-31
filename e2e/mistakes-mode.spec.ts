import { expect, test, type Locator, type Page } from "@playwright/test";
import { Chess } from "chess.js";

/**
 * SIG-1097: "My mistakes" practice mode.
 *
 * Two exercises are seeded into the browser-local mistake-exercises key
 * (guest path — no Supabase). The trainer must show the first position, keep
 * a failed exercise due, advance after a solve, and never touch the rating
 * or xp chrome.
 */

const MISTAKES_KEY = "xd-mistake-exercises";

const SEED_EXERCISES = [
  {
    key: "mx:first",
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    solutionUci: ["e1e8"],
    playedUci: "h2h3",
  },
  {
    key: "mx:second",
    fen: "7k/5Qpp/8/8/8/8/6PP/6K1 w - - 0 1",
    solutionUci: ["f7f8"],
    playedUci: "g2g3",
  },
] as const;

test("mistakes mode: a miss stays due, a solve advances, rating untouched", async ({ page, context }) => {
  await context.addInitScript(
    ({ key, exercises }: { key: string; exercises: readonly { key: string; fen: string; solutionUci: readonly string[]; playedUci: string }[] }) => {
      const createdAt = "2026-10-26T00:00:00.000Z";
      const map: Record<string, unknown> = {};
      for (const item of exercises) {
        map[item.key] = {
          exercise: {
            key: item.key,
            fen: item.fen,
            solutionUci: [...item.solutionUci],
            bestPv: [...item.solutionUci],
            playedUci: item.playedUci,
            label: "blunder",
            phase: "middlegame",
            lossCp: 200,
            beforePawns: 0.5,
            afterPawns: -0.5,
            motif: "positional",
            createdAt,
          },
          srs: null,
        };
      }
      window.localStorage.setItem(key, JSON.stringify(map));
      window.localStorage.removeItem(`${key}:owner`);
    },
    { key: MISTAKES_KEY, exercises: SEED_EXERCISES },
  );
  await page.goto("/puzzles/play?mode=mistakes");
  await expect(board(page)).toBeVisible();
  await expect(panel(page)).toContainText("My mistakes");

  // First exercise: wrong move marks it failed; Next moves to the second.
  expect(await boardKey(page)).toBe("mx-first");
  const firstSolution = solutionOf(SEED_EXERCISES[0].fen, [...SEED_EXERCISES[0].solutionUci]);
  const miss = wrongMove(SEED_EXERCISES[0].fen, firstSolution);
  await clickMove(page, miss.from, miss.to);
  await expect(bubbleTitle(page)).toHaveText("Incorrect");
  // Solved and failed attempts in mistakes mode award no xp and move no rating.
  await expect(panel(page).locator("span.bg-studio-success")).toHaveCount(0);
  const storedAfterMiss = await page.evaluate((k) => window.localStorage.getItem(k), MISTAKES_KEY);
  expect(storedAfterMiss ?? "").toContain('"intervalDays":1');
  await panel(page).getByRole("button", { name: "Next puzzle" }).click();
  await expect.poll(() => boardKey(page)).toBe("mx-second");

  // Solve it: right move marks solved, schedules it out, and shows caught-up.
  const secondSolution = solutionOf(SEED_EXERCISES[1].fen, [...SEED_EXERCISES[1].solutionUci]);
  await clickMove(page, secondSolution.from, secondSolution.to);
  await expect(bubbleTitle(page)).toHaveText("Solved");
  await expect(panel(page).locator("span.bg-studio-success")).toHaveCount(0);
  // First attempt on a fresh entry schedules interval 1 with tomorrow's due
  // date (scheduleReview: unscheduled → 1 day on correct); a fail records
  // mistakeCount 1, a solve records 0. Assert both directions, not the
  // absolute interval.
  const storedAfterSolve = await page.evaluate((k) => window.localStorage.getItem(k), MISTAKES_KEY);
  expect(storedAfterSolve ?? "").toContain('"mistakeCount":1');
  expect(storedAfterSolve ?? "").toContain('"mistakeCount":0');
  await panel(page).getByRole("button", { name: "Next puzzle" }).click();
  await expect(page.getByRole("heading", { name: "All caught up" })).toBeVisible();
});

function board(page: Page): Locator {
  // Board root id is `puzzle-<id>-board`, e.g. `puzzle-mx-first-board`.
  return page.locator('[id^="puzzle-mx-"][id$="-board"]');
}

function panel(page: Page): Locator {
  return page.locator("section").filter({ has: page.locator('[aria-live="polite"]') });
}

function bubbleTitle(page: Page): Locator {
  return panel(page).locator('[aria-live="polite"] p').first();
}

async function boardPuzzleId(page: Page): Promise<string> {
  const id = await board(page).getAttribute("id");
  if (!id) {
    throw new Error("puzzle board id not found");
  }
  // Board-safe ids strip the colon: `puzzle-mx-first-board`.
  return id.replace(/^puzzle-/, "").replace(/-board$/, "");
}

async function boardKey(page: Page): Promise<string> {
  return boardPuzzleId(page);
}

async function clickMove(page: Page, from: string, to: string): Promise<void> {
  // Square nodes carry data-square; ids contain colons (mx:…) which break
  // CSS id selectors, so click by data-square within the board subtree.
  const root = board(page);
  await root.locator(`[data-square="${from}"]`).first().click();
  await root.locator(`[data-square="${to}"]`).first().click();
}

function solutionOf(fen: string, solution: string[]): { from: string; to: string } {
  const [uci] = solution;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

/** A legal move that is not the solution. */
function wrongMove(fen: string, solution: { from: string; to: string }): { from: string; to: string } {
  const candidate = new Chess(fen)
    .moves({ verbose: true })
    .find((move) => !(move.from === solution.from && move.to === solution.to));
  if (!candidate) {
    throw new Error(`no wrong move available in ${fen}`);
  }
  return { from: candidate.from, to: candidate.to };
}
