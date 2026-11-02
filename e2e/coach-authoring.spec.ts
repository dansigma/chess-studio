import { expect, test } from "@playwright/test";

/**
 * SIG-1114: an anonymous visit to /courses/admin never reaches the admin area.
 * SIG-1181: the gate destination depends on Supabase config — `/courses` when
 * unconfigured (CI has no Supabase env), `/login?next=...` when configured
 * (local Supabase CLI runs). Accept either; both prove the gate held.
 */
test("anonymous visit to /courses/admin is gated (courses or login)", async ({ page }) => {
  await page.goto("/courses/admin");
  const url = () => new URL(page.url());
  await expect.poll(() => url().pathname).not.toBe("/courses/admin");
  await expect
    .poll(() => ({ pathname: url().pathname, search: url().search }))
    .toMatchObject({ pathname: expect.stringMatching(/^(\/courses|\/login)$/) });
  const { pathname, search } = { pathname: url().pathname, search: url().search };
  if (pathname === "/login") {
    expect(search).toContain(`next=${encodeURIComponent("/courses/admin")}`);
  }
});
