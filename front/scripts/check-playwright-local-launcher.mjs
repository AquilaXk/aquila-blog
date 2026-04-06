import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const configPath = path.join(projectRoot, "playwright.config.ts")
const configSource = fs.readFileSync(configPath, "utf8")

const requiredContracts = [
  {
    id: "darwin-local-flag",
    pattern: /const shouldUseChromiumChannel = process\.platform === "darwin" && !process\.env\.CI/,
  },
  {
    id: "chromium-channel",
    pattern: /channel:\s*"chromium"\s+as const/,
  },
  {
    id: "darwin-local-assertion",
    pattern: /assertDarwinLocalChromiumChannel\(defaultProjects\)/,
  },
  {
    id: "darwin-local-assertion-live",
    pattern: /assertDarwinLocalChromiumChannel\(liveMultiBrowserProjects\)/,
  },
]

const missing = requiredContracts
  .filter((contract) => !contract.pattern.test(configSource))
  .map((contract) => contract.id)

if (missing.length === 0) {
  process.exit(0)
}

console.error(
  [
    "[playwright-preflight] Playwright local chromium launcher contract drift detected.",
    "로컬 darwin에서는 chromium_headless_shell이 아니라 channel=chromium(new headless) 경로를 강제해야 합니다.",
    `config: ${configPath}`,
    `missing: ${missing.join(", ")}`,
  ].join("\n")
)

process.exit(1)
