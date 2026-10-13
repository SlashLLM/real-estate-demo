import { defineConfig, devices } from "@playwright/test";
import { APP_PORT, APP_URL, CRON_SECRET, ENGINE_PORT, ENGINE_SECRET, ENGINE_URL, STORAGE_STATE, TOKEN_ENC_KEY } from "./e2e/support/constants";

/**
 * Admin e2e suite. `pnpm test:e2e` starts a stub content engine and its own `next dev` on port 3100 (env overrides
 * below win over .env.local), creates a throwaway admin user + workspace in Supabase, runs every admin workflow,
 * then deletes that user, workspace and its media.
 */
export default defineConfig({
  testDir: "./e2e",
  // The specs share one workspace and some assert on totals, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  // `next dev` compiles each route on first visit, which can take a while on a cold start.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  outputDir: "e2e/.results",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: APP_URL,
    locale: "en-US",
    timezoneId: "Asia/Singapore",
    navigationTimeout: 120_000,
    actionTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "admin",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
    },
  ],
  webServer: [
    {
      command: "node e2e/stub-engine.mjs",
      url: `${ENGINE_URL}/__health`,
      env: { ENGINE_PORT: String(ENGINE_PORT), ENGINE_SECRET },
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: `pnpm exec next dev --port ${APP_PORT}`,
      url: `${APP_URL}/login`,
      timeout: 240_000,
      reuseExistingServer: false,
      // Supabase logs a warning per request in dev; E2E_SERVER_LOGS=1 shows the server output when debugging.
      stdout: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
      stderr: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
      env: {
        CONGEN_URL: ENGINE_URL,
        CONGEN_SHARED_SECRET: ENGINE_SECRET,
        TOKEN_ENC_KEY,
        NEXT_PUBLIC_SITE_URL: APP_URL,
        CRON_SECRET,
        // The autopilot tick only runs this site's workspace when this is set; the suite's workspace is created per run.
        TOTALWEB_WORKSPACE_ID: "",
      },
    },
  ],
});
