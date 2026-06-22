#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "../..")

const checks = [
  {
    name: "legal policy schema/hash/version drift",
    command: [process.execPath, "tools/legal/validate-legal-policies.mjs"],
  },
  {
    name: "privacy data-map processor/retention drift",
    command: [process.execPath, "tools/legal/validate-privacy-data-map.mjs"],
  },
  {
    name: "legal validator failure fixtures",
    command: [process.execPath, "--test", "tools/test/legal-policy-validator-fixtures.test.mjs"],
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
