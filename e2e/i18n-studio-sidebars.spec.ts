import { expect, test } from "@playwright/test";

/**
 * SIG-1074: with the pt-br locale stored, /studio renders Portuguese sidebar
 * strings — and with default settings everything stays English (so the EN
 * selectors in e2e/pgn-import-export.spec.ts keep working). Asserts only the
 * Files sidebar placeholder plus one more sidebar title, never full slices.
 */
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem("studio-clone-settings", JSON.stringify({ locale: "pt-br" }));
  });
});

test("files sidebar renders Portuguese with the pt-br locale stored", async ({ page }) => {
  await page.goto("/studio");

  // Files activity button is translated; open the Files sidebar.
  await page.getByRole("button", { name: "Arquivos", exact: true }).first().click();
  await expect(page.getByPlaceholder("Buscar arquivos")).toBeVisible();
  await expect(page.getByPlaceholder("Search files")).toHaveCount(0);
});

test("boards sidebar renders Portuguese with the pt-br locale stored", async ({ page }) => {
  await page.goto("/studio");

  // Boards is the default sidebar; assert its translated title + action directly.
  await expect(page.getByRole("heading", { name: "Tabuleiros abertos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo tabuleiro" })).toBeVisible();
});
