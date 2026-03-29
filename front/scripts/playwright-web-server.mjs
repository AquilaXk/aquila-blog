import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"
import { fileURLToPath } from "url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const buildIdPath = path.join(projectRoot, ".next", "BUILD_ID")

const watchedEntries = [
  "src",
  "public",
  "package.json",
  "next.config.js",
  "site.config.js",
]

const getLatestMtimeMs = (targetPath) => {
  if (!fs.existsSync(targetPath)) return 0

  const stat = fs.statSync(targetPath)
  if (!stat.isDirectory()) return stat.mtimeMs

  let latest = stat.mtimeMs
  const entries = fs.readdirSync(targetPath, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name === ".next" || entry.name === "node_modules" || entry.name === "test-results") continue
    latest = Math.max(latest, getLatestMtimeMs(path.join(targetPath, entry.name)))
  }

  return latest
}

const resolveNeedsBuild = () => {
  if (!fs.existsSync(buildIdPath)) return true

  const buildMtimeMs = fs.statSync(buildIdPath).mtimeMs
  const latestSourceMtimeMs = watchedEntries.reduce((maxMtime, entry) => {
    return Math.max(maxMtime, getLatestMtimeMs(path.join(projectRoot, entry)))
  }, 0)

  return latestSourceMtimeMs > buildMtimeMs
}

if (resolveNeedsBuild()) {
  const buildResult = spawnSync("yarn", ["build"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  })

  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1)
  }
}

const startResult = spawnSync("yarn", ["start", "-p", "3000"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
})

process.exit(startResult.status ?? 0)
