import { defineConfig, devices } from "@playwright/test";

/**
 * Issue #168 — Playwright config for the accessibility (axe) test suite.
 *
 * `webServer` boots `next dev` for the duration of the run so the suite
 * audits the same routes the user sees. Test files live under
 * `tests/a11y/*.spec.ts`.
 */
export default defineConfig({
  testDir: "./tests/a11y",
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
