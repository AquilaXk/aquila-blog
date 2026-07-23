#!/usr/bin/env node
import { readFileSync } from "node:fs"
import crypto from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const repoRoot = path.resolve(scriptDir, "../..")
const defaultContractPath = path.join(repoRoot, "deploy/env/env.contract.json")

export const parseEnvText = (text) => {
  const env = new Map()
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "")
    if (!line.trim() || /^\s*#/.test(line)) continue
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue

    let value = match[2].trim()
    const quote = value[0]
    if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1)
    }
    env.set(match[1], value)
  }
  return env
}

export const loadContract = (contractPath = defaultContractPath) =>
  JSON.parse(readFileSync(contractPath, "utf8"))

const valueOf = (env, key) => env.get(key)?.trim() || ""

const isRequired = (definition, env) => {
  if (definition.required === false) {
    if (!definition.requiredWhen) return false
  }
  if (!definition.requiredWhen) return definition.required !== false
  return valueOf(env, definition.requiredWhen.key) === String(definition.requiredWhen.equals)
}

const resolveTarget = (contract, targetName) => {
  const target = contract.targets?.[targetName]
  if (!target) throw new Error(`Unknown env target: ${targetName}`)
  if (!target.extends) return { ...target, keys: [...(target.keys || [])] }

  const parent = resolveTarget(contract, target.extends)
  return {
    ...parent,
    ...target,
    keys: [...(parent.keys || []), ...(target.keys || [])],
    crossChecks: [...(parent.crossChecks || []), ...(target.crossChecks || [])],
  }
}

const safeError = (key, message) => ({ key, message })

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex")

const hostnamePattern = /^(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/

const isUrl = (value) => {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

const hostOf = (value) => {
  try {
    return new URL(value).hostname
  } catch {
    return ""
  }
}

const validateKind = (definition, value) => {
  switch (definition.kind) {
    case undefined:
      return null
    case "boolean":
      return /^(true|false)$/i.test(value) ? null : "must be true or false"
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "must be an email"
    case "hostname":
      return hostnamePattern.test(value) ? null : "must be a hostname"
    case "integer":
      return /^-?\d+$/.test(value) ? null : "must be an integer"
    case "safe-absolute-path":
      if (!value.startsWith("/")) return "must be an absolute path"
      if (value === "/") return "must not be filesystem root"
      if (/\/{2,}/.test(value)) return "must not contain repeated path separators"
      if (/(^|\/)\.\.?($|\/)/.test(value)) return "must not contain traversal path segments"
      return null
    case "url":
      return isUrl(value) ? null : "must be a URL"
    case "https-url":
      if (!isUrl(value)) return "must be a URL"
      return value.startsWith("https://") ? null : "must start with https://"
    case "pinned-image":
      if (value.endsWith(":latest") || value.includes(":latest@")) return "must not use latest tag"
      return value.includes("@sha256:") || /:[^/:]+$/.test(value) ? null : "must include tag or digest"
    case "digest-image":
      if (value.endsWith(":latest") || value.includes(":latest@")) return "must not use latest tag"
      return /^[^@\s]+@sha256:[a-f0-9]{64}$/i.test(value) ? null : "must include sha256 digest"
    default:
      return `unknown validation kind: ${definition.kind}`
  }
}

export const validateEnvText = ({ contract, target, text }) => {
  const resolved = resolveTarget(contract, target)
  const env = parseEnvText(text)
  const placeholder = new RegExp(contract.placeholderPattern, "i")
  const errors = []
  const warnings = []

  for (const definition of resolved.keys || []) {
    const value = valueOf(env, definition.name)
    const required = isRequired(definition, env)

    if (!value) {
      if (required) errors.push(safeError(definition.name, "is required"))
      continue
    }

    if (definition.placeholderForbidden !== false && placeholder.test(value)) {
      errors.push(safeError(definition.name, "must not contain placeholder value"))
    }

    if (definition.allowedValues && !definition.allowedValues.includes(value)) {
      errors.push(safeError(definition.name, `must be one of: ${definition.allowedValues.join(", ")}`))
    }

    if (definition.minLength && value.length < definition.minLength) {
      errors.push(safeError(definition.name, `must be at least ${definition.minLength} characters`))
    }

    if (definition.forbiddenValues?.includes(value)) {
      errors.push(safeError(definition.name, "must not use forbidden value"))
    }

    if (definition.forbiddenSha256?.includes(sha256(value))) {
      errors.push(safeError(definition.name, "must not use forbidden fingerprint"))
    }

    if (definition.mustDifferFrom && value === valueOf(env, definition.mustDifferFrom)) {
      errors.push(safeError(definition.name, `must differ from ${definition.mustDifferFrom}`))
    }

    const kindError = validateKind(definition, value)
    if (kindError) errors.push(safeError(definition.name, kindError))

    if (!kindError && definition.kind === "integer") {
      const numericValue = Number(value)
      if (Number.isInteger(definition.min) && numericValue < definition.min) {
        errors.push(safeError(definition.name, `must be greater than or equal to ${definition.min}`))
      }
      if (Number.isInteger(definition.max) && numericValue > definition.max) {
        errors.push(safeError(definition.name, `must be less than or equal to ${definition.max}`))
      }
    }
  }

  for (const check of resolved.crossChecks || []) {
    if (check.type === "urlHostEquals") {
      const urlHost = hostOf(valueOf(env, check.urlKey))
      const expectedHost = valueOf(env, check.hostKey)
      if (urlHost && expectedHost && urlHost !== expectedHost) {
        errors.push(safeError(check.urlKey, `${check.hostKey} must match ${check.urlKey} host`))
      }
    }

    if (check.type === "cookieDomainCovers") {
      const cookieDomain = valueOf(env, check.domainKey)
      const urlHost = hostOf(valueOf(env, check.urlKey))
      if (cookieDomain && urlHost && urlHost !== cookieDomain && !urlHost.endsWith(`.${cookieDomain}`)) {
        errors.push(safeError(check.domainKey, `must cover ${check.urlKey} host`))
      }
    }

    if (check.type === "pathWithin") {
      const parentPath = (valueOf(env, check.parentKey) || check.defaultParent || "").replace(/\/+$/, "")
      const childPath = valueOf(env, check.childKey).replace(/\/+$/, "")
      const samePathDisallowed = check.strict !== false && parentPath && childPath && childPath === parentPath
      if (samePathDisallowed || (parentPath && childPath && !childPath.startsWith(`${parentPath}/`))) {
        errors.push(safeError(check.childKey, `must be inside ${check.parentKey}`))
      }
    }

    if (check.type === "pathNotWithin") {
      const parentPath = (valueOf(env, check.parentKey) || check.defaultParent || "").replace(/\/+$/, "")
      const relativeParent = (check.relativeParent || "").replace(/^\/+|\/+$/g, "")
      const forbiddenPath = relativeParent ? `${parentPath}/${relativeParent}` : parentPath
      const childPath = valueOf(env, check.childKey).replace(/\/+$/, "")
      if (forbiddenPath && childPath && (childPath === forbiddenPath || childPath.startsWith(`${forbiddenPath}/`))) {
        errors.push(safeError(check.childKey, `must not be inside ${check.parentKey}/${relativeParent}`))
      }
    }
  }

  return { ok: errors.length === 0, target, errors, warnings }
}

const parseArgs = (argv) => {
  const args = { contract: defaultContractPath }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--target") args.target = argv[++index]
    else if (arg === "--file") args.file = argv[++index]
    else if (arg === "--contract") args.contract = argv[++index]
    else if (arg === "--source-env-var") args.sourceEnvVar = argv[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  if (!args.target) throw new Error("--target is required")
  if (!args.file && !args.sourceEnvVar) throw new Error("--file or --source-env-var is required")

  const text = args.sourceEnvVar ? process.env[args.sourceEnvVar] || "" : readFileSync(args.file, "utf8")
  const result = validateEnvText({
    contract: loadContract(args.contract),
    target: args.target,
    text,
  })

  if (!result.ok) {
    console.error(`[env-contract] ${result.target} validation failed`)
    for (const error of result.errors) {
      console.error(`- ${error.key}: ${error.message}`)
    }
    process.exit(1)
  }

  console.log(`[env-contract] ${result.target} validation ok`)
}

if (process.argv[1] === scriptPath) {
  try {
    main()
  } catch (error) {
    console.error(`[env-contract] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
