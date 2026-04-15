import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontRoot = path.resolve(scriptDir, "..")

const sanitizeSegment = (value) =>
  value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "unknown"

const threadToken = sanitizeSegment(process.env.CODEX_THREAD_ID || `pid-${process.pid}`)
const requestedRuntimeMetricsPath = process.env.PLAYWRIGHT_PERF_RUNTIME_METRICS_PATH?.trim()
const runtimeMetricsPath = requestedRuntimeMetricsPath
  ? path.resolve(frontRoot, requestedRuntimeMetricsPath)
  : path.join(frontRoot, "test-results", "perf", threadToken, "runtime-guard-metrics.ndjson")

fs.mkdirSync(path.dirname(runtimeMetricsPath), { recursive: true })
fs.writeFileSync(runtimeMetricsPath, "")

const childEnv = {
  ...process.env,
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100",
  PLAYWRIGHT_PERF_RUNTIME_METRICS_PATH: runtimeMetricsPath,
  BACKEND_INTERNAL_URL: process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:1",
  NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3000",
}

delete childEnv.NO_COLOR

const child = spawn("yarn", ["playwright", "test", "e2e/perf.spec.ts", "--workers=1"], {
  cwd: frontRoot,
  stdio: "inherit",
  env: childEnv,
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

child.on("error", (error) => {
  console.error(`[playwright-perf] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
