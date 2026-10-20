import { expect, test } from "@playwright/test";

/** SIG-1033: baseline security headers, and no CSP violations on the main pages. */
test("/login is not frameable and carries a CSP", async ({ request }) => {
  const res = await request.get("/login");
  const headers = res.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  const csp = headers["content-security-policy"] ?? headers["content-security-policy-report-only"];
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src [^;]*'nonce-/);
});

test("/studio keeps cross-origin isolation alongside the CSP", async ({ request }) => {
  const headers = (await request.get("/studio")).headers();
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["cross-origin-embedder-policy"]).toBe("require-corp");
  expect(headers["x-frame-options"]).toBe("DENY");
});

test("main pages raise no CSP violations", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp ??= [];
      (window as unknown as { __csp: string[] }).__csp.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
  });
  for (const path of ["/login", "/puzzles", "/courses"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const violations = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
    expect(violations, path).toEqual([]);
  }
});
