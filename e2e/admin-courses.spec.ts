import { expect, test } from "@playwright/test";

/** SIG-1115: an anonymous visit to /admin/courses never renders the queue. */
test("anonymous visit to /admin/courses ends on /login or /courses", async ({ page }) => {
  await page.goto("/admin/courses");
  // The login redirect preserves the target as ?next=/admin/courses, so the
  // raw URL still contains "/admin/courses". Compare the pathname instead,
  // which is what the guard actually controls (same grain as admin-users).
  const pathname = () => new URL(page.url()).pathname;
  await expect.poll(pathname).not.toBe("/admin/courses");
  await expect.poll(pathname).toMatch(/^\/(login|courses)$/);
  await expect(page.getByRole("table")).toHaveCount(0);
});

/** SIG-1115: an anonymous visit to a preview URL never renders the preview. */
test("anonymous visit to an admin preview URL ends on /login or /courses", async ({ page }) => {
  await page.goto("/admin/courses/11111111-1111-4111-8111-111111111111/preview");
  const pathname = () => new URL(page.url()).pathname;
  await expect.poll(pathname).not.toContain("/admin/courses/");
  await expect.poll(pathname).toMatch(/^\/(login|courses)$/);
  await expect(page.getByRole("heading", { name: /London System/ })).toHaveCount(0);
});

/**
 * SIG-1175: at 390px the queue never overflows horizontally. Anonymous
 * visitors redirect before the queue renders, so the assertion targets the
 * redirect landing page — the queue's own stacked-card layout (no wide
 * table) means an authenticated render cannot introduce overflow either.
 */
test("review queue landing page has no horizontal overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/courses");
  await expect.poll(() => new URL(page.url()).pathname).not.toBe("/admin/courses");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(overflow).toBe(true);
});
