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

function expandScalar(value, env, seen = new Set()) {
  return String(value ?? "").replace(
    /\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)\b/gi,
    (reference, expressionName, bracedName, unbracedName) => {
      const name = (expressionName ?? bracedName ?? unbracedName).toLowerCase()
      if (seen.has(name) || !env.has(name)) return reference
      return expandScalar(env.get(name), env, new Set([...seen, name]))
    },
  )
}

function repositoryIsWeb(value, env) {
  return expandScalar(value, env).trim().toLowerCase() === webRepositoryName
}

function apiCalls(run) {
  return run.replace(/\\\r?\n\s*/g, " ")
    .split(/\r?\n/)
    .flatMap((line) => [...line.matchAll(/\bgh\s+api\b[^;&]*/gi)].map((match) => match[0]))
}

function shellTokens(command) {
  return [...command.matchAll(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g)]
    .map((match) => match[0].replace(/^(["'])(.*)\1$/, "$2"))
}

const apiValueOptions = new Set([
  "--method", "-X", "--header", "-H", "--field", "-F", "--raw-field", "-f", "--input",
  "--jq", "-q", "--template", "-t", "--cache", "--hostname", "--preview", "-p",
])

function apiEndpoint(tokens) {
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (apiValueOptions.has(token)) {
      index += 1
      continue
    }
    if (/^--(?:method|header|field|raw-field|input|jq|template|cache|hostname|preview)=/i.test(token)
      || /^-[XHFfqtp](?:=)?.+/.test(token)) continue
    if (token === "--") return tokens[index + 1]
    if (!token.startsWith("-")) return token
  }
  return undefined
}

function apiWrites(tokens) {
  let explicitMethod
  let implicitWrite = false
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === "--method" || token === "-X") explicitMethod = tokens[index + 1]
    else if (/^--method=/i.test(token)) explicitMethod = token.slice(token.indexOf("=") + 1)
    else if (/^-X=?[A-Za-z]+$/i.test(token)) explicitMethod = token.replace(/^-X=?/i, "")
    if (/^(?:-f|-F|--field|--raw-field|--input)$/i.test(token)
      || /^(?:-f|-F|--field|--raw-field|--input)=/i.test(token)
      || /^-[fF].+/i.test(token)) implicitWrite = true
  }
  return explicitMethod ? /^(?:POST|PATCH|PUT|DELETE)$/i.test(explicitMethod) : implicitWrite
}

function webApiResource(endpoint, env) {
  const expanded = expandScalar(endpoint, env).trim()
  const match = expanded.match(/^repos\/([^/]+\/[^/?#]+)(\/[^?#]*)?$/i)
  return match?.[1].toLowerCase() === webRepositoryName ? (match[2] ?? "") : undefined
}

function inspectWorkflow(file, contents) {
  let document
  try {
    document = workflowDocument(contents)
  } catch {
    findings.push(`${file}:invalid-workflow-yaml`)
    return
  }

  if (!webOwnerWorkflows.has(file) && /(?:^|[^A-Za-z0-9_.-])aquilaxk\/aquila-blog-web(?:\.git)?(?=$|[^A-Za-z0-9_.-])/i.test(contents)) {
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
    if (/^aquilaxk\/aquila-blog-web\/\.github\/workflows\/[^@\s]+@[^\s]+$/i.test(expandScalar(job.uses, jobEnv).trim())) {
      findings.push(`${file}:foreign-reusable-workflow`)
    }
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
      if (/\bgit\s+push\s+["']?https:\/\/github\.com\/aquilaxk\/aquila-blog-web\.git(?=["'\s]|$)/i.test(run)) {
        findings.push(`${file}:foreign-git-write`)
      }

      const logicalRun = run.replace(/\\\r?\n\s*/g, " ")
      const prCalls = logicalRun.split(/\r?\n/).filter((line) => /\bgh\s+pr\s+(?:create|edit|close|merge)\b/i.test(line))
      const targetedWebPr = prCalls.some((call) => {
        const argument = call.match(/(?:--repo(?:=|\s+)|-R(?:=|\s+))(?:("[^"]+")|('[^']+')|([^\s;&]+))/i)
        const target = argument
          ? (argument[1] ?? argument[2] ?? argument[3]).replace(/^["']|["']$/g, "")
          : env.get("gh_repo")
        return repositoryIsWeb(target, env)
      })
      if (targetedWebPr) findings.push(`${file}:foreign-pr-write`)

      const foreignApiWrite = apiCalls(run).some((call) => {
        const tokens = shellTokens(call)
        const resource = webApiResource(apiEndpoint(tokens), env)
        return resource !== undefined && apiWrites(tokens) && resource !== "/dispatches"
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
