import { expect, test } from "@playwright/test";

/**
 * SIG-1075: with the pt-br locale stored, /studio renders Portuguese dock tab
 * titles and panel copy — and switching back through Settings restores
 * English without losing the loaded position or the open engine panel.
 * Asserts only panels-slice copy (never chrome/sidebar slices).
 */
test("studio panels render Portuguese with the pt-br locale stored", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    window.localStorage.setItem("studio-clone-settings", JSON.stringify({ locale: "pt-br" }));
  });
  await page.goto("/studio");

  // Dock tab titles are translated (assert three, zero EN counterparts).
  await expect(page.getByRole("tab", { name: "Notação" }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Motor" }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Repertório" }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Notation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Engine", exact: true })).toHaveCount(0);

  // Engine panel status line is Portuguese on load (paused before start).
  await page.getByRole("tab", { name: "Motor" }).first().click();
  await expect(page.getByText("Motor em pausa — pressione o play")).toBeVisible();

  // Notation empty-tree hint is Portuguese.
  await expect(page.getByText("Faça um lance no tabuleiro.")).toBeVisible();
});

test("switching back to English through Settings restores English panels without losing the position", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    window.localStorage.setItem("studio-clone-settings", JSON.stringify({ locale: "pt-br" }));
  });
  await page.goto("/studio");

  // Play e2-e4 so we can prove the position survives the language switch.
  const board = page.locator("[data-board-image]");
  await expect(board.locator('[data-square="e2"]')).toBeVisible();
  await board.locator('[data-square="e2"]').click();
  await board.locator('[data-square="e4"]').click();
  const active = page.locator('button[aria-current="step"]');
  await expect(active.first()).toContainText("e4");

  // The engine panel is still mounted (proof below: no recreation).
  await expect(page.getByText("Motor em pausa — pressione o play")).toBeVisible();

  // Open Settings via the View menu and switch to English (same selectors as
  // the chrome slice spec).
  const menubar = page.locator("div.z-\\[1000\\]").first();
  await menubar.getByRole("button", { name: "Ver", exact: true }).click();
  await page.getByRole("menuitem", { name: /Configurações/ }).click();
  const dialog = page.getByRole("dialog");
  const languageRow = dialog.locator("div", { hasText: "Idioma do site" }).last();
  await languageRow.locator("select").selectOption("en");
  await page.keyboard.press("Escape");

  // Dock titles flip back to English.
  await expect(page.getByRole("tab", { name: "Notation", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Engine", exact: true }).first()).toBeVisible();

  // The loaded position persists (no reload / no notation loss).
  await expect(active.first()).toContainText("e4");

  // The engine panel is still mounted (no recreation): same DOM node still
  // shows the English status line.
  await expect(page.getByText("Engine paused — press play")).toBeVisible();

  // Persisted settings now hold the English locale (proof the switch landed).
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(window.localStorage.getItem("studio-clone-settings") ?? "{}").locale,
      ),
    )
    .toBe("en");
});

test("studio panels default to English without a stored locale", async ({ page }) => {
  await page.goto("/studio");

  await expect(page.getByRole("tab", { name: "Notation", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Engine", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Engine paused — press play")).toBeVisible();
});
