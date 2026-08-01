#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { closeSync, constants, fstatSync, openSync, readFileSync, readlinkSync } from "node:fs"
import path from "node:path"

const reportOnly = process.argv[2] === "--report-only"
if (process.argv.length > (reportOnly ? 3 : 2)) {
  console.error("Usage: node tools/repo-boundary/check-platform-boundary.mjs [--report-only]")
  process.exit(2)
}

const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
const self = "tools/repo-boundary/check-platform-boundary.mjs"
const scopes = [".github/", ".githooks/", "tools/", "deploy/", "back/"]
const forbidden = /working-directory:\s*["']?(?:\.?\/)?front(?:[/\\"'\s#]|$)|front\/yarn\.lock|frontLiveE2E|reusable-frontend-verify\.yml/
const findings = []

const tracked = execFileSync("git", ["-C", repositoryRoot, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)
for (const file of tracked) {
  if (file === self || !scopes.some((scope) => file.startsWith(scope))) continue
  const absolutePath = path.join(repositoryRoot, file)
  let contents
  let descriptor
  try {
    descriptor = openSync(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if (error?.code !== "ELOOP") throw error
    contents = readlinkSync(absolutePath)
  }
  if (descriptor !== undefined) {
    try {
      if (!fstatSync(descriptor).isFile()) continue
      contents = readFileSync(descriptor, "utf8")
    } finally {
      closeSync(descriptor)
    }
  }
  const lines = contents.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (forbidden.test(line)) findings.push(`${file}:${index + 1}`)
  })
}

if (findings.length > 0) {
  console.error(`[platform-boundary] ${reportOnly ? "report" : "forbidden reference"}: ${findings.join(", ")}`)
  if (!reportOnly) process.exit(1)
} else {
  console.log("[platform-boundary] ok")
}
