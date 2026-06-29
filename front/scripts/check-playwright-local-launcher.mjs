import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const configPath = path.join(projectRoot, "playwright.config.ts")
const configSource = fs.readFileSync(configPath, "utf8")

const forbiddenContracts = [
  {
    id: "chromium-channel",
    pattern: /channel:\s*"chromium"/,
  },
]

const present = forbiddenContracts
  .filter((contract) => contract.pattern.test(configSource))
  .map((contract) => contract.id)

if (present.length === 0) {
  process.exit(0)
}

console.error(
  [
    "[playwright-preflight] Playwright local chromium launcher contract drift detected.",
    "로컬 Playwright 기본값은 Google Chrome for Testing.app 경로를 강제하지 않아야 합니다.",
    `config: ${configPath}`,
    `forbidden: ${present.join(", ")}`,
  ].join("\n")
)

process.exit(1)
