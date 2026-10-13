import { expect, test } from "@playwright/test";

/**
 * SIG-932: sign-in smoke — self-skips unless E2E_TEST_USER and
 * E2E_TEST_PASSWORD secrets are present (local runs and CI without
 * secrets stay green without hitting Supabase).
 */
const hasCredentials = Boolean(process.env.E2E_TEST_USER && process.env.E2E_TEST_PASSWORD);

test.skip(!hasCredentials, "needs E2E_TEST_USER + E2E_TEST_PASSWORD");

test("sign-in redirects away from /login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_TEST_USER!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
});
