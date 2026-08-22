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
const webRepositoryName = "aquilaxk/aquila-blog-web"

function workflowSteps(contents) {
  const lines = [...contents.matchAll(/[^\n]*(?:\n|$)/g)]
    .filter((match) => match[0].length > 0)
    .map((match) => ({ offset: match.index, text: match[0].replace(/\r?\n$/, "") }))
  const steps = []
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index].text.match(/^(\s*)steps:\s*(?:#.*)?$/)
    if (!header) continue
    const headerIndent = header[1].length
    let sectionEnd = index + 1
    for (; sectionEnd < lines.length; sectionEnd += 1) {
      const line = lines[sectionEnd].text
      if (line.trim() === "" || line.trimStart().startsWith("#")) continue
      if ((line.match(/^\s*/) ?? [""])[0].length <= headerIndent) break
    }

    let stepIndent
    const starts = []
    for (let cursor = index + 1; cursor < sectionEnd; cursor += 1) {
      const start = lines[cursor].text.match(/^(\s*)-\s+[A-Za-z][A-Za-z0-9-]*\s*:/)
      if (!start || start[1].length <= headerIndent) continue
      stepIndent ??= start[1].length
      if (start[1].length === stepIndent) starts.push(lines[cursor].offset)
    }
    const endOffset = lines[sectionEnd]?.offset ?? contents.length
    for (let cursor = 0; cursor < starts.length; cursor += 1) {
      steps.push(contents.slice(starts[cursor], starts[cursor + 1] ?? endOffset))
    }
    index = sectionEnd - 1
  }
  return steps
}

function webRepositoryPattern(contents) {
  const aliases = new Set(["WEB_REPOSITORY"])
  const assignments = [...contents.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:\s*(.+?)\s*$/gm)]
    .map((match) => [match[1], match[2].replace(/^(["'])(.*)\1$/, "$2")])
  let changed = true
  while (changed) {
    changed = false
    for (const [name, value] of assignments) {
      const reference = value.match(/^\$\{([A-Z][A-Z0-9_]*)\}$/)?.[1]
        ?? value.match(/^\$\{\{\s*env\.([A-Z][A-Z0-9_]*)\s*\}\}$/)?.[1]
      if (value.toLowerCase() === webRepositoryName || (reference && aliases.has(reference))) {
        if (!aliases.has(name)) changed = true
        aliases.add(name)
      }
    }
  }
  const variables = [...aliases].flatMap((alias) => [
    String.raw`\$\{${alias}\}`,
    String.raw`\$\{\{\s*env\.${alias}\s*\}\}`,
  ])
  return String.raw`(?:AquilaXk\/aquila-blog-web|${variables.join("|")})`
}

function inspectWorkflow(file, contents) {
  const webRepository = webRepositoryPattern(contents)
  for (const step of workflowSteps(contents)) {
    const categories = []
    if (/uses:\s*actions\/checkout@/.test(step) && new RegExp(`repository:\\s*["']?${webRepository}`, "i").test(step)) {
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

    const webRepoArgument = new RegExp(`--repo\\s+["']?${webRepository}`, "i")
    if (/\bgh\s+pr\s+(?:create|edit|close|merge)\b/.test(step) && webRepoArgument.test(step)) {
      categories.push("foreign-pr-write")
    }

    const logicalStep = step.replace(/\\\r?\n\s*/g, " ")
    const apiCalls = logicalStep.split(/\r?\n/).flatMap((line) => [...line.matchAll(/\bgh\s+api\b[^;&]*/g)].map((match) => match[0]))
    const foreignApiWrite = apiCalls.some((call) => {
      const explicitMethod = call.match(/(?:--method(?:=|\s+)|-X(?:=|\s*)?)["']?(GET|POST|PATCH|PUT|DELETE)\b/i)?.[1]?.toUpperCase()
      const hasFields = /(?:^|\s)(?:-f|-F)(?:=|\s)|(?:^|\s)--(?:field|raw-field)(?:=|\s)/.test(call)
      const writes = explicitMethod ? explicitMethod !== "GET" : hasFields
      if (!writes) return false
      return [...call.matchAll(new RegExp(`repos/${webRepository}/([^\\s"'?\\\\]+)`, "gi"))]
        .some((match) => match[1].toLowerCase() !== "dispatches")
    })
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
