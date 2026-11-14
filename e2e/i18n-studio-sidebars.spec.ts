import { expect, test } from "@playwright/test";

/**
 * SIG-1074: with the pt-br locale stored, /studio renders Portuguese sidebar
 * strings — and with default settings everything stays English (so the EN
 * selectors in e2e/pgn-import-export.spec.ts keep working). Asserts only the
 * Library folder/import controls plus one sidebar title, never full slices.
 */
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem("studio-clone-settings", JSON.stringify({ locale: "pt-br" }));
  });
});

test("the Library folder and import controls render Portuguese with the pt-br locale stored", async ({ page }) => {
  await page.goto("/studio");

  // SIG-1325: the Files panel is gone from the activity bar; its folders live in the Library.
  await expect(page.getByRole("button", { name: "Arquivos", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bases de Dados", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Biblioteca", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Pastas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Importar PGN" }).click();
  await expect(page.getByRole("menuitem", { name: "Colar PGN" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Folders", exact: true })).toHaveCount(0);
});

test("boards sidebar renders Portuguese with the pt-br locale stored", async ({ page }) => {
  await page.goto("/studio");

  // Boards is the default sidebar; assert its translated title + action directly.
  await expect(page.getByRole("heading", { name: "Tabuleiros abertos" })).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("button", { name: "Novo tabuleiro" })).toBeVisible();
  // SIG-1200: default board row title and empty-board subtitle are localized.
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByText("Tabuleiro", { exact: true }).first()).toBeVisible();
  await expect(sidebar.getByText("Posição inicial", { exact: true }).first()).toBeVisible();
  await expect(sidebar.getByText("starting position", { exact: true })).toHaveCount(0);
});
