#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process"
import { closeSync, constants, fstatSync, openSync, readFileSync, readlinkSync } from "node:fs"
import path from "node:path"

const webRoot = path.resolve(import.meta.dirname, "../..")
const repositoryRoot = execFileSync("git", ["-C", webRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
const webPrefix = path.relative(repositoryRoot, webRoot)
const forbidden = /\.\.[/\\](back|deploy|infra|perf)([/\\]|$)/m
const findings = []
const args = process.argv.slice(2)

if (args.length > 1 || (args.length === 1 && args[0] !== "--staged")) {
  console.error("usage: check-web-boundary.mjs [--staged]")
  process.exit(64)
}

const staged = args[0] === "--staged"
const preCommitPath = path.posix.join(webPrefix, ".githooks/pre-commit")

const preCommit = staged
  ? execFileSync("git", ["-C", repositoryRoot, "show", `:${preCommitPath}`], { encoding: "utf8" })
  : readFileSync(path.join(webRoot, ".githooks/pre-commit"), "utf8")
if (!preCommit.includes("unset $(git rev-parse --local-env-vars)")) {
  findings.push(".githooks/pre-commit: repository-local Git env is not cleared")
}

if (staged) {
  const result = spawnSync("git", [
    "-C", repositoryRoot,
    "grep", "--cached", "-I", "-l", "-z", "-E", forbidden.source,
    "--", webPrefix || ".",
  ], { encoding: "utf8" })
  if (result.status === 0) findings.push(...result.stdout.split("\0").filter(Boolean))
  else if (result.status !== 1) {
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }
} else {
  const tracked = execFileSync("git", ["-C", repositoryRoot, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)
  for (const file of tracked) {
    if (webPrefix && file !== webPrefix && !file.startsWith(`${webPrefix}/`)) continue
    const absolute = path.join(repositoryRoot, file)
    let contents
    let descriptor
    try {
      descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    } catch (error) {
      if (error?.code !== "ELOOP") throw error
      contents = readlinkSync(absolute)
    }
    if (descriptor !== undefined) {
      try {
        if (!fstatSync(descriptor).isFile()) continue
        const bytes = readFileSync(descriptor)
        if (bytes.includes(0)) continue
        contents = bytes.toString("utf8")
      } finally {
        closeSync(descriptor)
      }
    }
    if (forbidden.test(contents)) findings.push(file)
  }
}

if (findings.length > 0) {
  console.error(`[web-boundary] violation: ${findings.join(", ")}`)
  process.exit(1)
}

console.log("[web-boundary] ok")
