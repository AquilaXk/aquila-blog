#!/usr/bin/env node
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptPath = fileURLToPath(import.meta.url)
const frontRoot = path.resolve(path.dirname(scriptPath), "../..")
const defaultContractPath = path.join(frontRoot, "config/env.contract.json")

export const parseEnvText = (text) => {
  const env = new Map()
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    env.set(match[1], value)
  }
  return env
}

export const loadContract = (contractPath = defaultContractPath) => JSON.parse(readFileSync(contractPath, "utf8"))

const valueOf = (env, key) => env.get(key)?.trim() || ""
const safeError = (key, message) => ({ key, message })

// compose 서비스명(점 없는 단일 레이블), loopback, RFC1918 사설 IP만 평문 http를 허용한다.
// 공개 호스트로 http를 쓰면 SSR 트래픽이 평문으로 나가므로 계속 거부한다.
const isContainerInternalHost = (host) => {
  if (host === "localhost" || host === "::1" || host === "[::1]") return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  // compose 네트워크의 서비스명은 점이 없다. 공개 FQDN과 구분되는 지점이다.
  return /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/i.test(host)
}

const validateKind = (kind, value) => {
  if (kind === undefined) return null
  if (kind === "positive-decimal") return /^[1-9]\d*$/.test(value) ? null : "must be a positive decimal"
  if (kind === "https-url") {
    try {
      return new URL(value).protocol === "https:" ? null : "must start with https://"
    } catch {
      return "must be an HTTPS URL"
    }
  }
  if (kind === "internal-url") {
    let parsed
    try {
      parsed = new URL(value)
    } catch {
      return "must be a URL"
    }
    if (parsed.protocol === "https:") return null
    if (parsed.protocol !== "http:") return "must be an HTTP or HTTPS URL"
    return isContainerInternalHost(parsed.hostname) ? null : "must start with https:// for a public host"
  }
  return "has an unsupported validation kind"
}

export const validateEnvText = ({ contract, target, text }) => {
  const definition = contract.targets?.[target]
  if (!definition) throw new Error("Unknown env target")
  const env = parseEnvText(text)
  const placeholder = new RegExp(contract.placeholderPattern, "i")
  const errors = []
  for (const key of definition.keys || []) {
    const value = valueOf(env, key.name)
    if (!value) {
      if (key.required !== false) errors.push(safeError(key.name, "is required"))
      continue
    }
    if (key.placeholderForbidden !== false && placeholder.test(value)) errors.push(safeError(key.name, "must not contain placeholder value"))
    if (key.minLength && value.length < key.minLength) errors.push(safeError(key.name, `must be at least ${key.minLength} characters`))
    if (key.allowedValues && !key.allowedValues.includes(value)) errors.push(safeError(key.name, `must be one of: ${key.allowedValues.join(", ")}`))
    const kindError = validateKind(key.kind, value)
    if (kindError) errors.push(safeError(key.name, kindError))
  }
  for (const check of definition.crossChecks || []) {
    if (check.type !== "exactlyOneOf") continue
    const present = check.keys.filter((key) => valueOf(env, key)).length
    if (present !== 1) errors.push(safeError(check.keys[0], `exactly one of ${check.keys.join(", ")} is required`))
  }
  return { ok: errors.length === 0, errors }
}

const parseArgs = (argv) => {
  const args = { contract: defaultContractPath }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--target") args.target = argv[++index]
    else if (arg === "--file") args.file = argv[++index]
    else if (arg === "--contract") args.contract = argv[++index]
    else if (arg === "--source-env-var") args.sourceEnvVar = argv[++index]
    else if (arg === "--process-env") args.processEnv = true
    else throw new Error("Unknown argument")
  }
  return args
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  if (!args.target || (!args.file && !args.sourceEnvVar && !args.processEnv)) throw new Error("--target and one input source are required")
  const text = args.processEnv
    ? Object.entries(process.env).map(([key, value]) => `${key}=${value || ""}`).join("\n")
    : args.sourceEnvVar ? process.env[args.sourceEnvVar] || "" : readFileSync(args.file, "utf8")
  const result = validateEnvText({ contract: loadContract(args.contract), target: args.target, text })
  if (!result.ok) {
    for (const error of result.errors) console.error(JSON.stringify(error))
    process.exit(1)
  }
}

if (process.argv[1] === scriptPath) {
  try {
    main()
  } catch {
    console.error(JSON.stringify(safeError("contract", "validation could not run")))
    process.exit(1)
  }
}
