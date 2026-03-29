import { defineConfig, devices } from "@playwright/test"

if (process.env.FORCE_COLOR && Object.prototype.hasOwnProperty.call(process.env, "NO_COLOR")) {
  delete process.env.NO_COLOR
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000"
const useWebServer = process.env.PLAYWRIGHT_USE_WEBSERVER !== "false"
const useLiveMultiBrowser = process.env.PLAYWRIGHT_LIVE_MULTI_BROWSER === "true"
const useLiveFailFast = process.env.PLAYWRIGHT_LIVE_FAIL_FAST === "true"
const inheritedEnv = { ...process.env }

if (inheritedEnv.FORCE_COLOR && Object.prototype.hasOwnProperty.call(inheritedEnv, "NO_COLOR")) {
  delete inheritedEnv.NO_COLOR
}

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
  retries: useLiveFailFast ? 0 : process.env.CI ? 1 : 0,
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
        env: {
          ...inheritedEnv,
          ENABLE_QA_ROUTES: inheritedEnv.ENABLE_QA_ROUTES || "true",
          NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3000",
          BACKEND_INTERNAL_URL: process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:1",
        },
        timeout: 120_000,
        reuseExistingServer: true,
      }
    : undefined,
  projects: useLiveMultiBrowser ? liveMultiBrowserProjects : defaultProjects,
})
