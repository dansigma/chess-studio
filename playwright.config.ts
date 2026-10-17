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
      use: { ...devices["Desktop Chrome"] },
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
