import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/unit",
  outputDir: "test-results/unit",
  timeout: 10_000,
  expect: {
    timeout: 1_000,
  },
  fullyParallel: true,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "playwright-report-unit", open: "never" }]]
    : [["list"]],
})
