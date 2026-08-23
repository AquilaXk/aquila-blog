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
  return String(value ?? "").replace(/\$\{\{\s*github\.repository_owner\s*\}\}/gi, "AquilaXk")
    .replace(/\$\{GITHUB_REPOSITORY_OWNER\}|\$GITHUB_REPOSITORY_OWNER\b/gi, "AquilaXk").replace(
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

function commandPrefix(source, end) {
  const contexts = [{ quote: undefined, start: 0 }]
  let escaped = false
  for (let index = 0; index < end; index += 1) {
    const context = contexts.at(-1)
    const character = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === "\\" && context.quote !== "'") {
      escaped = true
      continue
    }
    if (context.quote === "'") {
      if (character === "'") context.quote = undefined
      continue
    }
    if (character === "$" && source[index + 1] === "(") {
      contexts.push({ quote: undefined, start: index + 2 })
      index += 1
      continue
    }
    if (context.quote) {
      if (character === context.quote) context.quote = undefined
      continue
    }
    if (character === "'" || character === '"') {
      context.quote = character
      continue
    }
    if (character === ")" && contexts.length > 1) {
      contexts.pop()
      continue
    }
    if (character === "\n" || character === ";" || character === "&" || character === "|") {
      context.start = index + 1
    }
  }
  const context = contexts.at(-1)
  return context.quote ? undefined : source.slice(context.start, end).trim()
}

function isCommandPrefix(prefix) {
  if (prefix === undefined) return false
  if (!prefix) return true
  const tokens = shellTokens(prefix)
  const isAssignment = (token) => /^[A-Za-z_][A-Za-z0-9_]*=.*$/i.test(token)
  if (tokens[0]?.toLowerCase() === "env") {
    return tokens.length > 1 && tokens.slice(1).every(isAssignment)
  }
  return tokens.every((token) => /^(?:if|then|do|while|until|!|[A-Za-z_][A-Za-z0-9_]*=.*)$/i.test(token))
}

function logicalInvocations(run) {
  const source = run.replace(/\\\r?\n\s*/g, " ")
  const prefix = /(?:^|[\s(!])((?:gh|git)\b)/gim
  const invocations = []
  for (const match of source.matchAll(prefix)) {
    const start = match.index + match[0].lastIndexOf(match[1])
    const commandPrefixValue = commandPrefix(source, start)
    if (!isCommandPrefix(commandPrefixValue)) continue
    let quote
    let escaped = false
    let end = source.length
    for (let index = start; index < source.length; index += 1) {
      const character = source[index]
      if (escaped) {
        escaped = false
        continue
      }
      if (character === "\\" && quote !== "'") {
        escaped = true
        continue
      }
      if (quote) {
        if (character === quote) quote = undefined
        continue
      }
      if (character === "'" || character === '"') {
        quote = character
        continue
      }
      if (character === "\n" || character === ";" || character === "&" || character === "|" || character === ")") {
        end = index
        break
      }
    }
    invocations.push({ command: source.slice(start, end).trim(), prefix: commandPrefixValue })
  }
  return invocations
}

function invocationEnv(env, prefix) {
  const tokens = shellTokens(prefix)
  const assignments = tokens[0]?.toLowerCase() === "env" ? tokens.slice(1) : tokens
  const values = new Map(env)
  for (const assignment of assignments) {
    const separator = assignment.indexOf("=")
    if (separator > 0) {
      const value = assignment.slice(separator + 1)
      const quoted = value.match(/^(["'])(.*)\1$/)
      values.set(assignment.slice(0, separator).toLowerCase(), quoted ? quoted[2] : value)
    }
  }
  return values
}

function shellTokens(command) {
  return [...command.matchAll(/"(?:\\.|[^"\\])*"|'[^']*'|(?:(?:\$\{\{\s*env\.[A-Za-z_][A-Za-z0-9_]*\s*\}\}|[^\s]))+/g)]
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

function apiMethod(tokens, env) {
  let explicitMethod
  let implicitWrite = false
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === "--method" || token === "-X") explicitMethod = tokens[index + 1]
    else if (/^--method=/i.test(token)) explicitMethod = token.slice(token.indexOf("=") + 1)
    else if (/^-X(?:=)?.+$/i.test(token)) explicitMethod = token.replace(/^-X=?/i, "")
    if (/^(?:-f|-F|--field|--raw-field|--input)$/i.test(token)
      || /^(?:-f|-F|--field|--raw-field|--input)=/i.test(token)
      || /^-[fF].+/i.test(token)) implicitWrite = true
  }
  if (explicitMethod) return expandScalar(explicitMethod, env).trim().toUpperCase()
  return implicitWrite ? "POST" : "GET"
}

function webApiResource(endpoint, env) {
  let expanded = expandScalar(endpoint, env).trim().replace(/^\//, "").replace(/[?#].*$/, "")
  if (repositoryIsWeb(env.get("gh_repo"), env)) {
    expanded = expanded.replace(/^repos\/\{owner\}\/\{repo\}(?=\/|$)/i, `repos/${webRepositoryName}`)
  }
  const match = expanded.match(/^repos\/([^/]+\/[^/]+)(\/.*)?$/i)
  return match?.[1].toLowerCase() === webRepositoryName ? (match[2] ?? "") : undefined
}

function canonicalWebTarget(value, env) {
  const expanded = expandScalar(value, env).trim().replace(/^(["'])(.*)\1$/, "$2")
  const candidate = (expanded.includes("=") ? expanded.slice(expanded.indexOf("=") + 1) : expanded)
    .replace(/^(["'])(.*)\1$/, "$2")
  if (repositoryIsWeb(candidate, env) || webApiResource(candidate, env) !== undefined) return true
  return /^(?:(?:https:\/\/(?:[^\s/"']+@)?github\.com\/)|git@github\.com:|ssh:\/\/git@github\.com\/)aquilaxk\/aquila-blog-web(?:\.git)?(?:[\/#?]|$)/i.test(candidate)
}

function commandTargetsWeb(tokens, env) {
  return repositoryIsWeb(env.get("gh_repo"), env) || tokens.some((token) => canonicalWebTarget(token, env))
}

function ghOperation(tokens) {
  let index = 1
  while (tokens[index] === "-R" || tokens[index] === "--repo" || /^--repo=.+/i.test(tokens[index] ?? "")) {
    index += tokens[index].includes("=") ? 1 : 2
  }
  return { operation: tokens[index]?.toLowerCase(), index }
}

function gitOperation(tokens) {
  let index = 1
  while (tokens[index] === "-c" || /^-c[^=]+=/.test(tokens[index] ?? "") || tokens[index] === "-C" || tokens[index] === "--no-pager") {
    if (tokens[index] === "-c" && !/^[^=\s]+=.+$/.test(tokens[index + 1] ?? "")) return undefined
    if (tokens[index] === "-C" && !/^(?:\.|(?:\.{1,2}\/)?[A-Za-z0-9][A-Za-z0-9._/-]*|\/[A-Za-z0-9][A-Za-z0-9._/-]*)$/.test(tokens[index + 1] ?? "")) return undefined
    index += tokens[index] === "-c" || tokens[index] === "-C" ? 2 : 1
  }
  return tokens[index]?.toLowerCase()
}

function stepCreatesWebToken(uses, withValues, env) {
  if (!/^actions\/create-github-app-token@/i.test(uses)) return false
  const hasOwner = Object.hasOwn(withValues, "owner")
  const hasRepositories = Object.hasOwn(withValues, "repositories")
  if (!hasOwner && !hasRepositories) return false
  const owner = expandScalar(withValues.owner ?? "AquilaXk", env).trim().toLowerCase()
  if (owner !== "aquilaxk") return false
  const repositoryInput = expandScalar(withValues.repositories, env).trim()
  if (!repositoryInput) return hasOwner
  const repositories = repositoryInput.split(/[\r\n,]+/).map((value) => value.trim().toLowerCase())
  return repositories.includes("aquila-blog-web")
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
      if (stepCreatesWebToken(uses, withValues, env) && !webOwnerWorkflows.has(file)) {
        findings.push(`${file}:foreign-web-token`)
      }
      if (/^actions\/checkout@/i.test(uses) && repositoryIsWeb(withValues.repository, env)) {
        findings.push(`${file}:foreign-checkout`)
      }
      if (String(withValues.path ?? "").match(/^(?:\.\/)?web(?:\/|$)/i)) {
        findings.push(`${file}:foreign-checkout`)
      }

      const run = String(step.run ?? "")
      const directory = expandScalar(step["working-directory"] ?? jobDirectory, env)
      const foreignDirectory = /^(?:\.\/)?web(?:\/|$)/i.test(String(directory ?? ""))
      const buildOrWrite = /\b(?:yarn|npm|pnpm|bun)\b|import-platform-contracts|contracts:generate|openapi-typescript|\bgit\s+(?:add|checkout|commit|merge|push|reset)\b/i.test(run)
      const cdWeb = /\bcd\s+["']?(?:\.\/)?web["']?(?=[/\s;&|]|$)/i.test(run)
      const packageWeb = /\b(?:yarn|bun)\b[^\r\n;&|]*--cwd(?:=|[ \t]+)["']?(?:\.\/)?web["']?(?=[/"' \t;\r\n&|]|$)|\bnpm\b[^\r\n;&|]*--prefix(?:=|[ \t]+)["']?(?:\.\/)?web["']?(?=[/"' \t;\r\n&|]|$)|\bpnpm\b[^\r\n;&|]*(?:--dir|-C)(?:=|[ \t]+)["']?(?:\.\/)?web["']?(?=[/"' \t;\r\n&|]|$)/i.test(run)
      if ((foreignDirectory && buildOrWrite) || cdWeb || packageWeb) {
        findings.push(`${file}:foreign-workspace-build`)
      }
      if (/\bgit\s+-C\s+["']?(?:\.\/)?web["']?\s+(?:add|checkout|commit|merge|push|reset)\b/i.test(run)
        || ((foreignDirectory || cdWeb) && /\bgit\s+(?:add|checkout|commit|merge|push|reset)\b/i.test(run))) {
        findings.push(`${file}:foreign-git-write`)
      }

      for (const { command: invocation, prefix } of logicalInvocations(run)) {
        const commandEnv = invocationEnv(env, prefix)
        const tokens = shellTokens(invocation)
        const command = tokens[0]?.toLowerCase()
        const gh = command === "gh" ? ghOperation(tokens) : undefined
        const operation = command === "git" ? gitOperation(tokens) : gh?.operation
        if (command === "git" && !["clone", "push"].includes(operation)) continue
        const targetsWeb = commandTargetsWeb(tokens, commandEnv)
        if (command === "gh" && operation === "api") {
          const resource = webApiResource(apiEndpoint(tokens), commandEnv)
          if (!targetsWeb && resource === undefined) continue
          if (!webOwnerWorkflows.has(file)) findings.push(`${file}:foreign-web-owner`)
          const method = apiMethod(tokens, commandEnv)
          const allowedRead = resource !== undefined && /^(?:GET|HEAD)$/.test(method)
          const allowedDispatch = [
            ".github/workflows/sync-public-contract-to-web.yml",
            ".github/workflows/deploy.yml",
          ].includes(file)
            && resource === "/dispatches" && method === "POST"
          if (!allowedRead && !allowedDispatch) findings.push(`${file}:foreign-api-write`)
        } else if (command === "gh" && operation === "pr" && targetsWeb) {
          const allowed = new Set(["checks", "diff", "list", "status", "view", "checkout"])
          if (!allowed.has(tokens[gh.index + 1]?.toLowerCase())) findings.push(`${file}:foreign-pr-write`)
        } else if (command === "gh" && targetsWeb) {
          findings.push(`${file}:foreign-gh-write`)
        } else if (command === "git" && targetsWeb) {
          findings.push(`${file}:${operation === "clone" ? "foreign-checkout" : "foreign-git-write"}`)
        }
      }
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
