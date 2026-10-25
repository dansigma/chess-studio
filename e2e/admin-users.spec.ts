import { expect, test } from "@playwright/test";

/** SIG-1063: an anonymous visit to /admin/users never renders the users table. */
test("anonymous visit to /admin/users ends on /login or /courses", async ({ page }) => {
  await page.goto("/admin/users");
  // The login redirect preserves the target as ?next=/admin/users, so the raw
  // URL still contains "/admin/users". Compare the pathname instead, which is
  // what the guard actually controls.
  const pathname = () => new URL(page.url()).pathname;
  await expect.poll(pathname).not.toBe("/admin/users");
  await expect.poll(pathname).toMatch(/^\/(login|courses)$/);
  await expect(page.getByRole("table")).toHaveCount(0);
});
