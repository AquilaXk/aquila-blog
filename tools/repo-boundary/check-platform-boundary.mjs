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
const webOwnerWorkflows = new Set([
  ".github/workflows/sync-public-contract-to-web.yml",
  ".github/workflows/sync-web-legal-policy-to-platform.yml",
  ".github/workflows/deploy.yml",
])
const rubyYamlParser = [
  "require 'psych'",
  "require 'json'",
  "document = Psych.safe_load(STDIN.read, aliases: true)",
  "abort 'workflow YAML root must be a mapping' unless document.is_a?(Hash)",
  "STDOUT.write(JSON.generate(document))",
].join("; ")

function workflowDocument(contents) {
  const parsed = execFileSync("ruby", ["-e", rubyYamlParser], {
    encoding: "utf8",
    input: contents,
    maxBuffer: 4 * 1024 * 1024,
  })
  const document = JSON.parse(parsed)
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("workflow YAML root must be a mapping")
  return document
}

function mergedEnv(...sources) {
  const result = new Map()
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue
    for (const [name, value] of Object.entries(source)) result.set(name.toLowerCase(), String(value))
  }
  return result
}

function repositoryIsWeb(value, env, seen = new Set()) {
  const text = String(value ?? "").trim()
  if (text.toLowerCase() === webRepositoryName) return true
  const name = text.match(/^\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/i)?.[1]
    ?? text.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/)?.[1]
    ?? text.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/)?.[1]
  if (!name || seen.has(name.toLowerCase())) return false
  const next = env.get(name.toLowerCase())
  if (next === undefined) return false
  seen.add(name.toLowerCase())
  return repositoryIsWeb(next, env, seen)
}

function webRepositoryReferences(env) {
  const references = ["AquilaXk/aquila-blog-web"]
  for (const [name, value] of env) {
    if (!repositoryIsWeb(value, env, new Set([name]))) continue
    references.push(`\${${name}}`, `$${name}`, `\${{ env.${name} }}`)
  }
  return references
}

function apiCalls(run) {
  return run.replace(/\\\r?\n\s*/g, " ")
    .split(/\r?\n/)
    .flatMap((line) => [...line.matchAll(/\bgh\s+api\b[^;&]*/gi)].map((match) => match[0]))
}

function inspectWorkflow(file, contents) {
  let document
  try {
    document = workflowDocument(contents)
  } catch {
    findings.push(`${file}:invalid-workflow-yaml`)
    return
  }

  if (!webOwnerWorkflows.has(file) && /(?:^|[^A-Za-z0-9_.-])aquilaxk\/aquila-blog-web(?=$|[^A-Za-z0-9_.-])/i.test(contents)) {
    findings.push(`${file}:foreign-web-owner`)
  }

  const workflowEnv = mergedEnv(document.env)
  const workflowDirectory = document.defaults?.run?.["working-directory"]
  const jobs = document.jobs && typeof document.jobs === "object" && !Array.isArray(document.jobs)
    ? Object.values(document.jobs)
    : []
  for (const job of jobs) {
    if (!job || typeof job !== "object" || Array.isArray(job)) continue
    const jobEnv = mergedEnv(Object.fromEntries(workflowEnv), job.env)
    const jobDirectory = job.defaults?.run?.["working-directory"] ?? workflowDirectory
    const steps = Array.isArray(job.steps) ? job.steps : []
    for (const step of steps) {
      if (!step || typeof step !== "object" || Array.isArray(step)) continue
      const env = mergedEnv(Object.fromEntries(jobEnv), step.env)
      const uses = String(step.uses ?? "")
      const withValues = step.with && typeof step.with === "object" && !Array.isArray(step.with) ? step.with : {}
      if (/^actions\/checkout@/i.test(uses) && repositoryIsWeb(withValues.repository, env)) {
        findings.push(`${file}:foreign-checkout`)
      }
      if (String(withValues.path ?? "").match(/^(?:\.\/)?web(?:\/|$)/i)) {
        findings.push(`${file}:foreign-checkout`)
      }

      const run = String(step.run ?? "")
      const directory = step["working-directory"] ?? jobDirectory
      const foreignDirectory = /^(?:\.\/)?web(?:\/|$)/i.test(String(directory ?? ""))
      const buildOrWrite = /\b(?:yarn|npm|pnpm|bun)\b|import-platform-contracts|contracts:generate|openapi-typescript|\bgit\s+(?:add|checkout|commit|merge|push|reset)\b/i.test(run)
      const cdWeb = /\bcd\s+["']?(?:\.\/)?web["']?(?=[/\s;&|]|$)/i.test(run)
      const packageWeb = /\b(?:yarn|bun)\s+--cwd\s+["']?(?:\.\/)?web["']?(?=[/\s;&|]|$)|\bnpm\s+--prefix\s+["']?(?:\.\/)?web["']?(?=[/\s;&|]|$)|\bpnpm\s+(?:--dir|-C)\s+["']?(?:\.\/)?web["']?(?=[/\s;&|]|$)/i.test(run)
      if ((foreignDirectory && buildOrWrite) || cdWeb || packageWeb) {
        findings.push(`${file}:foreign-workspace-build`)
      }
      if (/\bgit\s+-C\s+["']?(?:\.\/)?web["']?\s+(?:add|checkout|commit|merge|push|reset)\b/i.test(run)
        || ((foreignDirectory || cdWeb) && /\bgit\s+(?:add|checkout|commit|merge|push|reset)\b/i.test(run))) {
        findings.push(`${file}:foreign-git-write`)
      }

      const logicalRun = run.replace(/\\\r?\n\s*/g, " ")
      const prCalls = logicalRun.split(/\r?\n/).filter((line) => /\bgh\s+pr\s+(?:create|edit|close|merge)\b/i.test(line))
      const targetedWebPr = prCalls.some((call) => {
        const argument = call.match(/(?:--repo(?:=|\s+)|-R(?:=|\s+))(?:("[^"]+")|('[^']+')|([^\s;&]+))/i)
        return argument && repositoryIsWeb((argument[1] ?? argument[2] ?? argument[3]).replace(/^["']|["']$/g, ""), env)
      })
      if (targetedWebPr) findings.push(`${file}:foreign-pr-write`)

      const references = webRepositoryReferences(env)
      const foreignApiWrite = apiCalls(run).some((call) => {
        const target = references.find((reference) => new RegExp(`repos/${reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[/"'\\s?]|$)`, "i").test(call))
        if (!target) return false
        const explicitMethod = call.match(/(?:--method(?:=|\s+)|-X(?:=|\s*)?)["']?(GET|POST|PATCH|PUT|DELETE)\b/i)?.[1]?.toUpperCase()
        const implicitWrite = /(?:^|\s)(?:-f|-F)(?:=|\s)|(?:^|\s)--(?:field|raw-field|input)(?:=|\s)/.test(call)
        const writes = explicitMethod ? explicitMethod !== "GET" : implicitWrite
        if (!writes) return false
        const exactDispatch = new RegExp(`repos/${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/dispatches(?=["'\\s]|$)`, "i").test(call)
        return !exactDispatch
      })
      if (foreignApiWrite) findings.push(`${file}:foreign-api-write`)
    }
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
