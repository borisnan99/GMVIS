const { defineConfig } = require("@playwright/test");

/* The Node API server serves both the static site and the API, so Playwright
   exercises the full stack (dynamic blog, gallery and admin) on one origin. */
const ADMIN_PASSWORD = "test-admin-pass";

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/global-setup.js",
  metadata: { adminPassword: ADMIN_PASSWORD },
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: "node server/src/index.js",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: "3000",
      DATA_DIR: "./.pwtest-data",
      SITE_DIR: ".",
      ADMIN_PASSWORD: ADMIN_PASSWORD,
      SESSION_SECRET: "test-session-secret",
      NODE_ENV: "test",
    },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
