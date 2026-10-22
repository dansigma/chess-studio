import { expect, test } from "@playwright/test";

/**
 * SIG-1073: with the pt-br locale stored, /studio renders Portuguese chrome
 * (menu bar, settings dialog, activity bar, status bar), and switching back
 * through Settings shows English again. Asserts only chrome owned by this
 * slice — never sidebar/panel content (later slices).
 */
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem("studio-clone-settings", JSON.stringify({ locale: "pt-br" }));
  });
});

test("studio chrome renders Portuguese with the pt-br locale stored", async ({ page }) => {
  await page.goto("/studio");

  // Top menu bar labels are translated.
  const menubar = page.locator("div.z-\\[1000\\]").first();
  await expect(menubar.getByRole("button", { name: "Arquivo", exact: true })).toBeVisible();
  await expect(menubar.getByText("Arquivo", { exact: true })).toBeVisible();
  await expect(menubar.getByText("File", { exact: true })).toHaveCount(0);

  // Activity bar tooltips use the translated titles.
  await expect(page.getByRole("button", { name: "Buscar" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Tabuleiros abertos" }).first()).toBeVisible();

  // File menu items are translated.
  await menubar.getByRole("button", { name: "Arquivo", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /Novo tabuleiro vazio/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Abrir PGN/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // View menu items are translated.
  await menubar.getByRole("button", { name: "Ver", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /Virar tabuleiro/ })).toBeVisible();
  await expect(page.getByRole("menuitemcheckbox", { name: /Mostrar coordenadas/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Configurações/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // Status bar sync label is translated.
  const footer = page.locator("footer").first();
  await expect(footer.getByText(/Convidado · sem sincronização|Sincronizado|Salvando/)).toBeVisible();

  // Settings dialog renders Portuguese sections.
  await menubar.getByRole("button", { name: "Ver", exact: true }).click();
  await page.getByRole("menuitem", { name: /Configurações/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Configurações" })).toBeVisible();
  await expect(dialog.getByText("Aparência")).toBeVisible();
  await expect(dialog.getByText("Idioma do site")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Concluir" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("switching back to English through Settings restores English chrome", async ({
  page,
}) => {
  await page.goto("/studio");

  const menubarEn = page.locator("div.z-\\[1000\\]").first();
  await expect(menubarEn.getByRole("button", { name: "Arquivo", exact: true })).toBeVisible();
  await menubarEn.getByRole("button", { name: "Ver", exact: true }).click();
  await page.getByRole("menuitem", { name: /Configurações/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Configurações" })).toBeVisible();

  // The language select is labeled "Idioma do site"; switch to English.
  const languageRow = dialog.locator("div", { hasText: "Idioma do site" }).last();
  await languageRow.locator("select").selectOption("en");

  await expect(page.getByRole("button", { name: "File", exact: true })).toBeVisible();
  await expect(menubarEn.getByRole("button", { name: "Arquivo", exact: true })).toHaveCount(0);
});
