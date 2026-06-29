import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const configPath = path.join(projectRoot, "playwright.config.ts")
const configSource = fs.readFileSync(configPath, "utf8")

const requiredContracts = [
  {
    id: "default-chromium-project",
    pattern: /const defaultProjects = \[\s*{\s*name:\s*"chromium",\s*use:\s*{\s*\.\.\.devices\["Desktop Chrome"\],\s*},\s*},\s*\]/s,
  },
  {
    id: "live-chromium-project",
    pattern: /const liveMultiBrowserProjects = \[\s*{\s*name:\s*"chromium",\s*use:\s*{\s*\.\.\.devices\["Desktop Chrome"\],\s*},\s*},/s,
  },
]

const missing = requiredContracts
  .filter((contract) => !contract.pattern.test(configSource))
  .map((contract) => contract.id)

const forbiddenContracts = [
  {
    id: "darwin-local-channel-flag",
    pattern: /shouldUseChromiumChannel/,
  },
  {
    id: "forced-chromium-channel",
    pattern: /channel:\s*["']chromium["']/,
  },
  {
    id: "darwin-local-channel-assertion",
    pattern: /assertDarwinLocalChromiumChannel/,
  },
]

const presentForbidden = forbiddenContracts
  .filter((contract) => contract.pattern.test(configSource))
  .map((contract) => contract.id)

if (missing.length === 0 && presentForbidden.length === 0) process.exit(0)

console.error(
  [
    "[playwright-preflight] Playwright local chromium launcher contract drift detected.",
    "로컬 기본 Playwright 실행은 Google Chrome for Testing/channel=chromium 경로를 강제하지 않아야 합니다.",
    `config: ${configPath}`,
    missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
    presentForbidden.length > 0 ? `forbidden: ${presentForbidden.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n")
)

process.exit(1)
