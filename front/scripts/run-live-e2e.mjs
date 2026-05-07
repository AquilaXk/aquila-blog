import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import nextEnv from "@next/env"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontRoot = path.resolve(scriptDir, "..")
const { loadEnvConfig } = nextEnv
const credentialKeys = [
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_USERNAME",
  "E2E_ADMIN_PASSWORD",
  "E2E_LIVE_ADMIN_EMAIL",
  "E2E_LIVE_ADMIN_USERNAME",
  "E2E_LIVE_ADMIN_PASSWORD",
]
const initialCredentialEnv = Object.fromEntries(credentialKeys.map((key) => [key, process.env[key]]))

const mutedEnvLog = {
  info: () => {},
  error: (message, error) => {
    console.error(`[live-e2e] ${message}`, error)
  },
}

const { loadedEnvFiles } = loadEnvConfig(frontRoot, true, mutedEnvLog, true)

// E2E passwords often contain dotenv comment/interpolation characters, so preserve local literals.
const stripOptionalQuotes = (value) => {
  const trimmed = value.trim()
  const quote = trimmed[0]
  if ((quote === "\"" || quote === "'" || quote === "`") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

const literalCredentialEnv = new Map()
for (const envFile of loadedEnvFiles) {
  for (const line of envFile.contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    const [, key, value] = match
    if (!credentialKeys.includes(key) || literalCredentialEnv.has(key)) continue
    literalCredentialEnv.set(key, stripOptionalQuotes(value))
  }
}

for (const [key, value] of literalCredentialEnv.entries()) {
  if (!initialCredentialEnv[key]?.trim()) {
    process.env[key] = value
  }
}

const applyFallbackEnv = (target, source) => {
  const targetValue = process.env[target]?.trim()
  const sourceValue = process.env[source]?.trim()
  if (!targetValue && sourceValue) {
    process.env[target] = sourceValue
  }
}

applyFallbackEnv("E2E_ADMIN_EMAIL", "E2E_LIVE_ADMIN_EMAIL")
applyFallbackEnv("E2E_ADMIN_USERNAME", "E2E_LIVE_ADMIN_USERNAME")
applyFallbackEnv("E2E_ADMIN_PASSWORD", "E2E_LIVE_ADMIN_PASSWORD")

const loadedEnvFileNames = loadedEnvFiles.map((envFile) => envFile.path).join(", ")
if (loadedEnvFileNames) {
  console.log(`[live-e2e] loaded env files: ${loadedEnvFileNames}`)
}

const hasLiveCredentials = Boolean(
  (process.env.E2E_ADMIN_EMAIL?.trim() || process.env.E2E_ADMIN_USERNAME?.trim()) &&
    process.env.E2E_ADMIN_PASSWORD?.trim()
)

if (!hasLiveCredentials) {
  console.warn(
    "[live-e2e] credentials missing: set E2E_ADMIN_EMAIL or E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD in front/.env.local or shell; credentialed tests will skip."
  )
}

const childEnv = {
  ...process.env,
  PLAYWRIGHT_LIVE_MULTI_BROWSER: process.env.PLAYWRIGHT_LIVE_MULTI_BROWSER || "true",
  PLAYWRIGHT_USE_WEBSERVER: process.env.PLAYWRIGHT_USE_WEBSERVER || "false",
}

delete childEnv.NO_COLOR

const child = spawn("yarn", ["playwright", "test", "e2e/live.spec.ts", "--workers=1", ...process.argv.slice(2)], {
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
  console.error(`[live-e2e] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
