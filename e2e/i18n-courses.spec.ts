import { expect, test } from "@playwright/test";

/** SIG-1071: with the pt-br locale stored, /courses renders Portuguese. */
test("courses renders Portuguese with the pt-br locale stored", async ({ page, context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem("studio-clone-settings", JSON.stringify({ locale: "pt-br" }));
  });
  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: "Cursos" })).toBeVisible();
  await expect(page.getByText("Cursos")).toHaveCount(1);
  await expect(page.getByText("Courses")).toHaveCount(0);
  await expect(page.getByText("Todos os temas")).toBeVisible();
});

/** SIG-1071: the default locale keeps the English courses catalog. */
test("courses renders English by default", async ({ page }) => {
  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();
  await expect(page.getByText("Cursos")).toHaveCount(0);
});
