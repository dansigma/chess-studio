import { defineConfig, devices } from "@playwright/test";

/**
 * SIG-932: Playwright smoke tests for the primary Next.js path.
 * `webServer` builds + serves production Next so specs assert real behavior.
 * The sign-in spec self-skips without E2E_TEST_USER/E2E_TEST_PASSWORD secrets.
 * SIG-970: NEXT_PUBLIC_E2E_REVIEW_FAKE=1 bakes the deterministic review engine
 * into the e2e server build only (fails closed in production).
 * SIG-1181: the default server keeps the ambient Supabase configuration so the
 * seeded suite (sign-in, i18n auth, legal) runs normally. The anonymous
 * `/courses/admin` gate spec runs on its own Supabase-unconfigured server.
 */
const sharedEnv = {
  NEXT_ALIAS_WORKERD_STUB: "1",
  NEXT_PUBLIC_E2E_REVIEW_FAKE: "1",
};

const GATE_SPEC = /coach-authoring\.spec\.ts/;

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
      testIgnore: [/mobile-studio\.spec\.ts/, GATE_SPEC],
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
    {
      // SIG-1181: anonymous admin-gate spec, isolated from the seeded suite.
      name: "gate-anon",
      testMatch: GATE_SPEC,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3100" },
    },
  ],
  webServer: [
    {
      command: "npm run build && npm run start",
      url: "http://localhost:3000/studio",
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: sharedEnv,
    },
    {
      // Starts only after the shared build is being served. Dev mode (not the
      // shared production build) because Next inlines NEXT_PUBLIC_* at build
      // time; its Supabase env is deliberately empty so the `/courses/admin`
      // gate lands on `/courses` regardless of the ambient/seeded config.
      command:
        "sh -c 'until curl -sf -o /dev/null http://localhost:3000/courses; do sleep 0.5; done; PORT=3100 npm run dev'",
      url: "http://localhost:3100/courses",
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        ...sharedEnv,
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        SUPABASE_URL: "",
        SUPABASE_PUBLISHABLE_KEY: "",
        SUPABASE_SECRET_KEY: "",
      },
    },
  ],
});
