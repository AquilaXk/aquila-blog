import { defineConfig, devices } from "@playwright/test"

if (process.env.FORCE_COLOR && Object.prototype.hasOwnProperty.call(process.env, "NO_COLOR")) {
  delete process.env.NO_COLOR
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000"
const useWebServer = process.env.PLAYWRIGHT_USE_WEBSERVER !== "false"
const useLiveMultiBrowser = process.env.PLAYWRIGHT_LIVE_MULTI_BROWSER === "true"
const useLiveFailFast = process.env.PLAYWRIGHT_LIVE_FAIL_FAST === "true"
const playwrightJsonReportPath = process.env.PLAYWRIGHT_JSON_REPORT_PATH?.trim() || ""
const inheritedEnv = { ...process.env }
const resolvedBackendInternalUrl = inheritedEnv.BACKEND_INTERNAL_URL || "http://127.0.0.1:1"
const shouldEnableAdminGuardQaBypassByDefault =
  resolvedBackendInternalUrl.replace(/\/+$/, "") === "http://127.0.0.1:1"
const resolvedAdminGuardQaBypass =
  inheritedEnv.ADMIN_GUARD_QA_BYPASS || (shouldEnableAdminGuardQaBypassByDefault ? "true" : "false")

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

const playwrightReporters: NonNullable<ReturnType<typeof defineConfig>["reporter"]> = process.env.CI
  ? [["github"], ["html", { open: "never" }]]
  : [["list"]]

if (playwrightJsonReportPath) {
  playwrightReporters.push(["json", { outputFile: playwrightJsonReportPath }])
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: useLiveFailFast ? 0 : process.env.CI ? 1 : 0,
  reporter: playwrightReporters,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: useWebServer
    ? {
        command: "node scripts/playwright-web-server.mjs",
        url: baseURL,
        cwd: __dirname,
        env: {
          ...inheritedEnv,
          ENABLE_QA_ROUTES: inheritedEnv.ENABLE_QA_ROUTES || "true",
          NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3000",
          BACKEND_INTERNAL_URL: resolvedBackendInternalUrl,
          ADMIN_GUARD_QA_BYPASS: resolvedAdminGuardQaBypass,
        },
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
  projects: useLiveMultiBrowser ? liveMultiBrowserProjects : defaultProjects,
})
