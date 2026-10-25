import { expect, test } from "@playwright/test";

/** SIG-1035: with the pt-br locale stored, /login renders Portuguese. */
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem("studio-clone-settings", JSON.stringify({ locale: "pt-br" }));
  });
});

test("login renders Portuguese with the pt-br locale stored", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
  await expect(page.getByText("Bem-vindo de volta")).toHaveCount(1);
  await expect(page.getByText("Welcome back")).toHaveCount(0);

  const configured = (await page.getByText("Adicione NEXT_PUBLIC_SUPABASE_URL").count()) === 0;
  test.skip(
    !configured,
    "Supabase env is not configured on the e2e server; the Google button is hidden by design.",
  );
  await expect(page.getByRole("button", { name: "Continuar com o Google" })).toBeVisible();
});

test("update-password renders Portuguese with the pt-br locale stored", async ({ page }) => {
  await page.goto("/login/update-password");
  await expect(page.getByRole("heading", { name: "Escolha uma nova senha" })).toBeVisible();
  await expect(page.getByText("Choose a new password")).toHaveCount(0);
});
