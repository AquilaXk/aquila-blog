#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "../..")

const checks = [
  {
    name: "pinned Web policy lock integrity",
    command: [process.execPath, "tools/contracts/check-web-policy-lock.mjs"],
  },
  {
    name: "privacy data-map processor/retention drift",
    command: [process.execPath, "tools/legal/validate-privacy-data-map.mjs"],
  },
  {
    name: "Web policy contract failure fixtures",
    command: [process.execPath, "--test", "tools/test/web-policy-contract.test.mjs"],
  },
  {
    name: "privacy launch checklist evidence sync",
    command: [process.execPath, "tools/privacy/validate-launch-gate-checklist.mjs"],
  },
  {
    name: "privacy launch checklist failure fixtures",
    command: [process.execPath, "--test", "tools/test/privacy-launch-gate-fixtures.test.mjs"],
  },
]

for (const check of checks) {
  console.log(`[privacy-gate] ${check.name}`)
  const result = spawnSync(check.command[0], check.command.slice(1), {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  })

  if (result.error) {
    console.error(`[privacy-gate] ${check.name} failed to start: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`[privacy-gate] ${check.name} failed`)
    process.exit(result.status ?? 1)
  }
}

console.log("[privacy-gate] ok")
