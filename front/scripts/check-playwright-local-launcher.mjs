import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const configPath = path.join(projectRoot, "playwright.config.ts")
const packageJsonPath = path.join(projectRoot, "package.json")
const configSource = fs.readFileSync(configPath, "utf8")
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))

const requiredContracts = [
  {
    id: "darwin-channel-guard",
    source: configSource,
    pattern: /const shouldUseChromiumChannel =\s*process\.platform === "darwin" &&\s*!process\.env\.CI &&\s*process\.env\.PLAYWRIGHT_LOCAL_CHROMIUM_CHANNEL !== "false"/,
  },
  {
    id: "chromium-channel",
    source: configSource,
    pattern: /channel:\s*"chromium"\s+as const/,
  },
  {
    id: "yarn-playwright-cft-opt-out",
    source: packageJson.scripts?.playwright || "",
    pattern: /PLAYWRIGHT_LOCAL_CHROMIUM_CHANNEL=false/,
  },
]

const missing = requiredContracts
  .filter((contract) => !contract.pattern.test(contract.source))
  .map((contract) => contract.id)

if (missing.length === 0) {
  process.exit(0)
}

console.error(
  [
    "[playwright-preflight] Playwright local chromium launcher contract drift detected.",
    "raw macOS Playwright guard는 유지하고 yarn playwright 진입점만 CFT crash 경로를 opt-out 해야 합니다.",
    `config: ${configPath}`,
    `package: ${packageJsonPath}`,
    `missing: ${missing.join(", ")}`,
  ].join("\n")
)

process.exit(1)
