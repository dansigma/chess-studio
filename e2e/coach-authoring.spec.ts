import { expect, test } from "@playwright/test";

/** SIG-1114: an anonymous visit to /courses/admin is sent to /courses (page gate). */
test("anonymous visit to /courses/admin ends on /courses", async ({ page }) => {
  await page.goto("/courses/admin");
  const url = () => new URL(page.url());
  await expect.poll(() => url().pathname).not.toBe("/courses/admin");
  await expect.poll(() => url().pathname).toBe("/courses");
});
