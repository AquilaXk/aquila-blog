import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const cwd = process.cwd()
const reportDir = path.join(cwd, process.env.STORYBOOK_GATE_REPORT_DIR || "test-results/storybook")
const reportPath = path.join(reportDir, "storybook-gate-report.json")
const markdownPath = path.join(reportDir, "storybook-gate-report.md")
const enforcement = (process.env.STORYBOOK_GATE_ENFORCEMENT || "warn").toLowerCase()
const failOnUnsupported = process.env.STORYBOOK_GATE_FAIL_ON_UNSUPPORTED === "1"
const startedAt = Date.now()
const nodeMajor = Number(process.versions.node.split(".")[0] || "0")
const nodeRange = { min: 18, max: 22 }

const ensureReportDir = () => {
  fs.mkdirSync(reportDir, { recursive: true })
}

const writeReport = (payload) => {
  ensureReportDir()
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2))

  const lines = [
    "# Storybook Gate Report",
    "",
    `- status: ${payload.status}`,
    `- enforcement: ${payload.enforcement}`,
    `- node: ${payload.node}`,
    `- durationMs: ${payload.durationMs}`,
  ]

  if (payload.reason) {
    lines.push(`- reason: ${payload.reason}`)
  }
  if (payload.exitCode !== null && payload.exitCode !== undefined) {
    lines.push(`- exitCode: ${payload.exitCode}`)
  }

  lines.push("")
  fs.writeFileSync(markdownPath, lines.join("\n"))
}

const finishWithReport = ({ status, reason, exitCode }) => {
  writeReport({
    status,
    reason: reason || "",
    exitCode: typeof exitCode === "number" ? exitCode : null,
    enforcement,
    node: process.version,
    durationMs: Date.now() - startedAt,
  })
}

if (nodeMajor < nodeRange.min || nodeMajor > nodeRange.max) {
  const reason = `unsupported-node:${process.version} (supported: ${nodeRange.min}-${nodeRange.max})`
  console.warn(`[storybook-gate] ${reason}`)

  finishWithReport({
    status: "skipped",
    reason,
    exitCode: null,
  })

  if (enforcement === "strict" && failOnUnsupported) {
    process.exit(1)
  }

  process.exit(0)
}

const result = spawnSync(process.platform === "win32" ? "storybook.cmd" : "storybook", ["build"], {
  cwd,
  stdio: "inherit",
  env: {
    ...process.env,
    HOME: process.env.HOME || path.join(cwd, ".storybook-home"),
    CI: process.env.CI || "1",
    STORYBOOK_DISABLE_TELEMETRY: process.env.STORYBOOK_DISABLE_TELEMETRY || "1",
    STORYBOOK_DISABLE_UPDATE_CHECK: process.env.STORYBOOK_DISABLE_UPDATE_CHECK || "1",
    __NEXT_PRIVATE_RENDER_WORKER: process.env.__NEXT_PRIVATE_RENDER_WORKER || "defined",
  },
})

if (result.status === 0) {
  finishWithReport({
    status: "passed",
    reason: "",
    exitCode: 0,
  })
  process.exit(0)
}

const failureCode = typeof result.status === "number" ? result.status : 1
finishWithReport({
  status: enforcement === "strict" ? "failed" : "warn",
  reason: "storybook build failed",
  exitCode: failureCode,
})

if (enforcement === "strict") {
  process.exit(failureCode)
}

console.warn(`[storybook-gate] storybook build failed but enforcement=${enforcement}, continuing.`)
process.exit(0)
