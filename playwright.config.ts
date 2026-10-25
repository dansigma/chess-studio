import { defineConfig, devices } from "@playwright/test";

/**
 * SIG-932: Playwright smoke tests for the primary Next.js path.
 * `webServer` builds + serves production Next so specs assert real behavior.
 * The sign-in spec self-skips without E2E_TEST_USER/E2E_TEST_PASSWORD secrets.
 * SIG-970: NEXT_PUBLIC_E2E_REVIEW_FAKE=1 bakes the deterministic review engine
 * into the e2e server build only (fails closed in production).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /mobile-studio\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // SIG-1043: mobile studio slice — 390x844 touch viewport with a
      // phone UA. devices["iPhone 14"] defaults to WebKit, which this
      // repo does not install; spread the desktop-Chromium base (Chromium
      // browser) and add the mobile viewport + touch + iPhone UA instead,
      // so both projects run on the installed Chromium browser.
      name: "mobile",
      testMatch: /mobile-studio\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
      },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000/studio",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      NEXT_ALIAS_WORKERD_STUB: "1",
      NEXT_PUBLIC_E2E_REVIEW_FAKE: "1",
    },
  },
});
