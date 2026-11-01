import { defineConfig } from "@playwright/test";
import local from "./playwright.config.js";

// Reuse the original fake Supabase URL and ephemeral PGlite fixture only.
export default defineConfig({
  ...local,
  testDir: "./tests-simulation",
  outputDir: "./test-results/simulation",
  timeout: 90000,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/simulation/results.json" }],
  ],
});
