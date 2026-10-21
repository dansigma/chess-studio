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
  expect(csp).toContain("object-src 'none'");
  // SIG-1054: violations are reported to /api/csp-report.
  expect(csp).toContain("report-uri /api/csp-report");
  expect(csp).toContain("report-to csp-endpoint");
  expect(headers["reporting-endpoints"]).toBe('csp-endpoint="/api/csp-report"');
});

test("/api/csp-report accepts both report formats and echoes nothing", async ({ request }) => {
  const legacy = await request.post("/api/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: JSON.stringify({
      "csp-report": { "document-uri": "http://localhost:3000/login", "effective-directive": "img-src", "blocked-uri": "https://e2e.example/x.png" },
    }),
  });
  expect(legacy.status()).toBe(204);
  expect(await legacy.text()).toBe("");

  const batch = await request.post("/api/csp-report", {
    headers: { "content-type": "application/reports+json" },
    data: JSON.stringify([
      { type: "csp-violation", url: "http://localhost:3000/login", body: { effectiveDirective: "img-src", blockedURL: "https://e2e.example/x.png" } },
    ]),
  });
  expect(batch.status()).toBe(204);

  const wrongType = await request.post("/api/csp-report", { data: { hello: "world" } });
  expect(wrongType.status()).toBe(415);
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
