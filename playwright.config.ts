import { defineConfig, devices } from "@playwright/test";

/* End-to-end tests (feature 23): the demo script, axe checks, and phone
   layouts. See e2e/README.md.

   - Against a local production build (default): `npm run build`, then
     `npm run e2e`; Playwright starts `next start -p 3100` if nothing is
     listening there.
   - Against a deployment: `E2E_BASE_URL=https://… npm run e2e`.
   Run `npm run demo:reset` first: the steps expect the seeded state (the
   ungraded submission, an empty bell). Tests run one at a time, in order.

   Branded Chrome (channel "chrome"), not Playwright's Chromium: the
   lecture is H.264 MP4, which open-source Chromium can't play. */

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const local = !process.env.E2E_BASE_URL;
const chrome = { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL ?? "chrome" };

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  outputDir: "e2e/.results",
  use: {
    baseURL,
    locale: "en-GB",
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "demo", testMatch: /demo\.spec\.ts/, use: { ...chrome, viewport: { width: 1440, height: 960 } } },
    { name: "builder", testMatch: /builder\.spec\.ts/, use: { ...chrome, viewport: { width: 1440, height: 960 } } },
    { name: "a11y", testMatch: /a11y\.spec\.ts/, use: { ...chrome, viewport: { width: 1440, height: 960 } } },
    { name: "perf", testMatch: /perf\.spec\.ts/, use: { ...chrome, viewport: { width: 1440, height: 960 } } },
    // Feature 34: the public landing page, signed out (its 390px test sets its own viewport).
    { name: "landing", testMatch: /landing\.spec\.ts/, use: { ...chrome, viewport: { width: 1440, height: 960 } } },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...chrome, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    },
  ],
  webServer: local
    ? { command: "npm run start -- -p 3100", url: "http://localhost:3100/sign-in", reuseExistingServer: true, timeout: 120_000 }
    : undefined,
});
