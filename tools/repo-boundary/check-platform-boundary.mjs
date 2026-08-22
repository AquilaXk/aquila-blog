#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { closeSync, constants, fstatSync, openSync, readFileSync, readlinkSync } from "node:fs"
import path from "node:path"

if (process.argv.length !== 2) {
  console.error("Usage: node tools/repo-boundary/check-platform-boundary.mjs")
  process.exit(2)
}

const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
const self = "tools/repo-boundary/check-platform-boundary.mjs"
const scopes = [".github/", ".githooks/", "tools/", "deploy/", "back/"]
const forbidden = /working-directory:\s*["']?(?:\.?\/)?front(?:[/\\"'\s#]|$)|front\/yarn\.lock|frontLiveE2E|reusable-frontend-verify\.yml/
const findings = []
const webRepository = String.raw`(?:AquilaXk\/aquila-blog-web|\$\{WEB_REPOSITORY\}|\$\{\{\s*env\.WEB_REPOSITORY\s*\}\})`

function inspectWorkflow(file, contents) {
  const starts = [...contents.matchAll(/^\s{6}-\s+/gm)].map((match) => match.index)
  for (let index = 0; index < starts.length; index += 1) {
    const step = contents.slice(starts[index], starts[index + 1] ?? contents.length)
    const categories = []
    if (/uses:\s*actions\/checkout@/.test(step) && new RegExp(`repository:\\s*["']?${webRepository}`).test(step)) {
      categories.push("foreign-checkout")
    }

    const foreignWorkspace = /working-directory:\s*["']?(?:\.\/)?web(?:[\/"'\s#]|$)/.test(step)
    const workspaceBuild = /\b(?:yarn|npm|pnpm|bun)\b/.test(step) || /import-platform-contracts|contracts:generate|openapi-typescript/.test(step)
    const foreignCwdBuild = /\b(?:yarn|bun)\s+--cwd\s+["']?(?:\.\/)?web(?:[\/"'\s]|$)/.test(step)
      || /\bnpm\s+--prefix\s+["']?(?:\.\/)?web(?:[\/"'\s]|$)/.test(step)
      || /\bpnpm\s+(?:--dir|-C)\s+["']?(?:\.\/)?web(?:[\/"'\s]|$)/.test(step)
      || /\bcd\s+["']?(?:\.\/)?web["']?\s*(?:&&|;)\s*(?:yarn|npm|pnpm|bun)\b/.test(step)
    if ((foreignWorkspace && workspaceBuild) || foreignCwdBuild) {
      categories.push("foreign-workspace-build")
    }
    if (/git\s+-C\s+["']?(?:\.\/)?web["']?\s+(?:add|checkout|commit|merge|push|reset)\b/.test(step)
      || (foreignWorkspace && /\bgit\s+(?:add|checkout|commit|merge|push|reset)\b/.test(step))) {
      categories.push("foreign-git-write")
    }

    const webRepoArgument = new RegExp(`--repo\\s+["']?${webRepository}`)
    if (/\bgh\s+pr\s+(?:create|edit|close|merge)\b/.test(step) && webRepoArgument.test(step)) {
      categories.push("foreign-pr-write")
    }

    const foreignApiWrite = step.split(/\r?\n/).some((line) =>
      /\bgh\s+api\b/.test(line)
      && /(?:--method|-X)\s+(?:POST|PATCH|PUT|DELETE)\b/.test(line)
      && [...line.matchAll(new RegExp(`repos/${webRepository}/([^\\s"'?\\\\]+)`, "g"))]
        .some((match) => match[1] !== "dispatches"),
    )
    if (foreignApiWrite) categories.push("foreign-api-write")

    for (const category of categories) findings.push(`${file}:${category}`)
  }
}

const tracked = execFileSync("git", ["-C", repositoryRoot, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)
for (const file of tracked) {
  if (file === "front" || file.startsWith("front/")) {
    findings.push(file)
    continue
  }
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
  if (file.startsWith(".github/workflows/") && /\.ya?ml$/.test(file)) inspectWorkflow(file, contents)
}

if (findings.length > 0) {
  console.error(`[platform-boundary] forbidden reference: ${findings.join(", ")}`)
  process.exit(1)
} else {
  console.log("[platform-boundary] ok")
}
