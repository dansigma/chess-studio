import { expect, test } from "@playwright/test";

/** SIG-1064: an anonymous visit to /coach-invite/<token> is sent to /login with next preserved. */
test("anonymous visit to /coach-invite/<token> ends on /login with next preserved", async ({ page }) => {
  const token = "a".repeat(43);
  await page.goto(`/coach-invite/${token}`);
  // The login redirect preserves the target as ?next=/coach-invite/<token>, so
  // the raw URL still contains "/coach-invite". Compare the pathname instead,
  // which is what the guard actually controls (same pattern as admin-users).
  const url = () => new URL(page.url());
  await expect.poll(() => url().pathname).not.toBe(`/coach-invite/${token}`);
  await expect.poll(() => url().pathname).toBe("/login");
  expect(url().searchParams.get("next")).toBe(`/coach-invite/${token}`);
  await expect(page.getByRole("heading", { name: /coach invite|convite de treinador/i })).toHaveCount(0);
});
