import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import nextEnv from "@next/env"

import { loadContract, validateEnvText } from "./env/validate-env.mjs"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontRoot = path.resolve(scriptDir, "..")
const { loadEnvConfig } = nextEnv
// `production-live-verify.yml`이 사라진 뒤 이 스크립트가 live 검증의 유일한 실행 경로다(#1542).
// live spec 두 개를 모두 여기서 돌린다 - 한쪽만 부르면 다른 쪽은 실행자가 0이 된다.
const liveSpecs = ["e2e/live.spec.ts", "e2e/editor-live-visual.spec.ts"]
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

// playwright.config.ts는 PLAYWRIGHT_BASE_URL이 없으면 http://127.0.0.1:3000으로 내려앉는다.
// 이 스크립트는 PLAYWRIGHT_USE_WEBSERVER=false로 돌리므로, 그 상태의 "live" 실행은 아무것도
// 검증하지 않으면서 통과한다. 실행 전에 live target 계약으로 fail closed한다.
const assertEnvTarget = (target) => {
  const text = Object.entries(process.env).map(([key, value]) => `${key}=${value || ""}`).join("\n")
  const result = validateEnvText({ contract: loadContract(), target, text })
  if (result.ok) return
  for (const error of result.errors) console.error(`[live-e2e] ${target}: ${error.key} ${error.message}`)
  process.exit(1)
}

assertEnvTarget("live-ready")
// 자격 증명은 선택이다(없으면 해당 테스트가 skip). 다만 주어졌다면 placeholder나 반쪽짜리
// identity로 실행되지 않도록 credentialed 계약까지 확인한다.
if (process.env.E2E_LIVE_ADMIN_PASSWORD?.trim()) assertEnvTarget("live-e2e")

const childEnv = {
  ...process.env,
  PLAYWRIGHT_LIVE_MULTI_BROWSER: process.env.PLAYWRIGHT_LIVE_MULTI_BROWSER || "true",
  PLAYWRIGHT_USE_WEBSERVER: process.env.PLAYWRIGHT_USE_WEBSERVER || "false",
}

delete childEnv.NO_COLOR

const child = spawn("yarn", ["playwright", "test", ...liveSpecs, "--workers=1", ...process.argv.slice(2)], {
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
