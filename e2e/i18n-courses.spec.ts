import { expect, test } from "@playwright/test";

/** SIG-1071: with the pt-br locale stored, /courses renders Portuguese. */
test("courses renders Portuguese with the pt-br locale stored", async ({ page, context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem("studio-clone-settings", JSON.stringify({ locale: "pt-br" }));
  });
  await page.goto("/courses");
  // Both the chrome nav link and the main heading read "Cursos", so scope each
  // assertion instead of counting page-wide text matches.
  await expect(page.locator("main").getByRole("heading", { name: "Cursos" })).toBeVisible();
  await expect(page.locator("header nav").getByRole("link", { name: "Cursos" })).toBeVisible();
  await expect(page.locator("main").getByText("Courses")).toHaveCount(0);
  await expect(page.locator("main").getByText("Todos os temas")).toBeVisible();
});

/** SIG-1071: the default locale keeps the English courses catalog. */
test("courses renders English by default", async ({ page }) => {
  await page.goto("/courses");
  await expect(page.locator("main").getByRole("heading", { name: "Courses" })).toBeVisible();
  await expect(page.locator("main").getByText("Cursos")).toHaveCount(0);
});
