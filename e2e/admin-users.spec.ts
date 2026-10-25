import { expect, test } from "@playwright/test";

/** SIG-1063: an anonymous visit to /admin/users never renders the users table. */
test("anonymous visit to /admin/users ends on /login or /courses", async ({ page }) => {
  await page.goto("/admin/users");
  // The login redirect preserves the target as ?next=/admin/users, so match
  // on the path only — the query string legitimately contains "/admin/users".
  await expect(page).not.toHaveURL(/\/admin\/users(\?|$)/);
  await expect(page).toHaveURL(/(\/login|\/courses)/);
  await expect(page.getByRole("table")).toHaveCount(0);
});
