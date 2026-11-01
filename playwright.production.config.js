import { defineConfig } from "@playwright/test";

// Deliberately independent of the local/PGlite suite: no webServer, .env,
// storageState, credentials, trace, screenshot, video or raw network recording.
export default defineConfig({
  testDir: "./tests-production",
  outputDir: "./test-results/production",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "https://volleyball-tournament-omega.vercel.app",
    channel: "chrome",
    headless: true,
    serviceWorkers: "block",
    trace: "off",
    screenshot: "off",
    video: "off",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/production/results.json" }],
  ],
});
