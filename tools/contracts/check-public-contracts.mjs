import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

function resolveRoot(args) {
  if (args.length === 0) {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  }
  if (args.length === 2 && args[0] === "--root") {
    return path.resolve(args[1])
  }
  throw new Error("Usage: node tools/contracts/check-public-contracts.mjs [--root <repository-root>]")
}

const root = resolveRoot(process.argv.slice(2))
const syncResult = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "sync-public-contracts.mjs"), "--root", root], {
  cwd: root,
  stdio: "inherit",
})
if (syncResult.status !== 0) {
  process.exit(syncResult.status ?? 1)
}

const trackedResult = spawnSync(
  "git",
  [
    "ls-files",
    "--error-unmatch",
    "--",
    "contracts/public-api/openapi.json",
    "contracts/public-api/error-codes.json",
    "contracts/public-api/manifest.json",
  ],
  { cwd: root, stdio: "inherit" },
)
if (trackedResult.status !== 0) {
  process.exit(trackedResult.status ?? 1)
}

const diffResult = spawnSync("git", ["diff", "--exit-code", "--", "contracts/public-api"], {
  cwd: root,
  stdio: "inherit",
})
process.exit(diffResult.status ?? 1)
