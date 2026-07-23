#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"

const GENERATED_FILE = "packages/shared-contracts/src/generated/backend-openapi.d.ts"
const REPORT_DIR = "test-results/contracts-openapi"
const DIFF_REPORT = path.join(REPORT_DIR, "openapi-contract.diff")
const DIFF_PREVIEW_LINES = 120

const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  })
  return result
}

const fail = (message) => {
  console.error(`[contracts:check] ${message}`)
  process.exit(1)
}

const main = async () => {
  const generateResult = run("yarn", ["contracts:generate"], { stdio: "inherit" })
  if (generateResult.status !== 0) {
    fail("OpenAPI 타입 생성에 실패했습니다.")
  }

  const quietResult = run("git", ["diff", "--quiet", "--", GENERATED_FILE])
  if (quietResult.status === 0) {
    console.log("[contracts:check] generated types are up-to-date")
    return
  }
  if (quietResult.status !== 1) {
    fail(`git diff --quiet 실행 실패(status=${quietResult.status ?? "unknown"})`)
  }

  const diffResult = run("git", ["diff", "--", GENERATED_FILE])
  const diffText = diffResult.stdout || ""

  await fs.mkdir(path.resolve(REPORT_DIR), { recursive: true })
  await fs.writeFile(path.resolve(DIFF_REPORT), diffText, "utf8")

  const preview = diffText.split("\n").slice(0, DIFF_PREVIEW_LINES).join("\n")
  console.error("::error::OpenAPI 계약 타입 드리프트를 감지했습니다.")
  console.error(`[contracts:check] diff report: ${DIFF_REPORT}`)
  console.error("[contracts:check] fix: run `yarn contracts:generate` and commit updated file")
  console.error("--- diff preview (truncated) ---")
  console.error(preview)
  console.error("--- end preview ---")
  process.exit(1)
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
