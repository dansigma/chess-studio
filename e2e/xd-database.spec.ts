import { expect, test } from "@playwright/test";
import { Chess } from "chess.js";

const PGN = `[Event "Digital Open"]
[White "Sample White"]
[Black "Sample Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0`;

test("browse Base Xadrez Digital moves and open a database game", async ({ page }) => {
  const chess = new Chess();
  const line = new Map<string, string>();
  for (const san of ["e4", "e5", "Nf3"]) {
    const fen = chess.fen();
    line.set(fen, chess.move(san).lan);
  }
  await page.route("**/api/xd-database/tree?*", (route) => {
    const fen = new URL(route.request().url()).searchParams.get("fen") ?? "";
    const uci = line.get(fen);
    return route.fulfill({ json: {
      total: uci ? 23 : 0,
      opening: uci && uci !== "e2e4" ? { eco: "C20", name: "Database Opening" } : null,
      moves: uci ? [{ uci, white: 10, draws: 8, black: 5, averageRating: 2360, lastYear: 2025 }] : [],
    } });
  });
  await page.route("**/api/explorer?*", (route) => route.fulfill({ json: {
    source: "masters", fen: chess.fen(), opening: null, white: 0, draws: 0, black: 0, moves: [], games: [],
  } }));
  await page.route("**/api/xd-database/games?*", (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    if (cursor === "0") {
      return route.fulfill({ json: { games: [], nextCursor: 5000 } });
    }
    return route.fulfill({ json: {
      games: [{
        id: 42, white: "Sample White", black: "Sample Black", result: "1-0",
        whiteElo: 2400, blackElo: 2320, date: "2025.05.01", event: "Digital Open", eco: "C20",
      }],
      nextCursor: null,
    } });
  });
  await page.route("**/api/xd-database/game/42", (route) =>
    route.fulfill({ body: PGN, contentType: "application/x-chess-pgn" }));

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/studio");
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Layouts", exact: true }).press("Enter");
  await page.getByRole("menuitemradio", { name: "Full analysis", exact: true }).press("Enter");
  const source = page.getByRole("combobox", { name: "Explorer source" });
  const explorer = page.getByRole("tabpanel").filter({ has: source });
  await source.selectOption({ label: "Base Xadrez Digital" });

  await explorer.getByRole("button", { name: /^e4\b/ }).click();
  await expect(explorer.getByTitle("Database Opening", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sample White.*Sample Black/ })).toBeVisible();
  await explorer.getByRole("button", { name: /^e5\b/ }).click();
  await explorer.getByRole("button", { name: /^Nf3\b/ }).click();
  await expect(explorer.getByText("No games for this position.")).toBeVisible();

  await page.getByRole("button", { name: "Library", exact: true }).first().click();
  await page.getByTestId("library-source-card").filter({ hasText: "Base Xadrez Digital" }).click();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  const row = page.getByTestId("library-row").filter({ hasText: "Sample White" });
  const pgnResponse = page.waitForResponse("**/api/xd-database/game/42");
  await row.dblclick();
  expect((await pgnResponse).ok()).toBe(true);
  await page.getByRole("tab", { name: "Notation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nc6", exact: true })).toBeVisible();
});
