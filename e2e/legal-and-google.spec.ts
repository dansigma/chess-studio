import { expect, test } from "@playwright/test";

/** SIG-1057: legal pages, their English-path redirects, and the login consent line / Google button. */
test("/privacidade and /termos render", async ({ page }) => {
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Política de Privacidade");
  await expect(page.getByText("Rascunho — sujeito a revisão jurídica")).toHaveCount(0);
  await expect(page.getByText(/62\.281\.698\/0001-18/).first()).toBeVisible();
  await expect(page.getByText(/\[(RAZÃO SOCIAL|CNPJ|DATA|COMARCA)\]/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Privacy Policy/ })).toBeVisible();

  await page.goto("/termos");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Termos de Uso");
});

test("/privacy and /terms redirect to the Portuguese routes", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page).toHaveURL(/\/privacidade$/);
  await page.goto("/terms");
  await expect(page).toHaveURL(/\/termos$/);
});

test("login shows the legal consent line and, when Supabase is configured, the Google button", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/termos");
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacidade");

  const configured = (await page.getByText("Add NEXT_PUBLIC_SUPABASE_URL").count()) === 0;
  test.skip(!configured, "Supabase env is not configured on the e2e server; the Google button is hidden by design.");

  const google = page.getByRole("button", { name: "Continue with Google" });
  await expect(google).toBeVisible();
  await page.getByRole("tab", { name: "Sign up" }).click();
  await expect(google).toBeVisible();
});
