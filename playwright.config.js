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
  metadata: { adminPassword: ADMIN_PASSWORD },
  use: {
    baseURL: "http://localhost:3100",
    headless: true,
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    // Dedicated test port (3100) to avoid colliding with a dev server on 3000.
    // Playwright starts webServer before globalSetup. Clean the test data in
    // the server launcher so an open SQLite database/uploads dir is not deleted.
    command: "node tests/start-server.js",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: "3100",
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
