const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: "npx serve -l 3000 .",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 15_000,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
