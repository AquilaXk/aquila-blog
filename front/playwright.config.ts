import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000"
const useWebServer = process.env.PLAYWRIGHT_USE_WEBSERVER !== "false"
const useLiveMultiBrowser = process.env.PLAYWRIGHT_LIVE_MULTI_BROWSER === "true"

const defaultProjects = [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  },
]

const liveMultiBrowserProjects = [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: "webkit",
    use: { ...devices["Desktop Safari"] },
  },
]

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: useWebServer
    ? {
        command: "yarn start -p 3000",
        url: baseURL,
        cwd: __dirname,
        timeout: 120_000,
        reuseExistingServer: true,
      }
    : undefined,
  projects: useLiveMultiBrowser ? liveMultiBrowserProjects : defaultProjects,
})
