import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { writePublicManifest } from "./write-public-manifest.mjs"

const errorCodeKeys = ["code", "httpStatus", "defaultUserMessage", "kind"]

function resolveRoot(args) {
  if (args.length === 0) {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  }
  if (args.length === 2 && args[0] === "--root") {
    return path.resolve(args[1])
  }
  throw new Error("Usage: node tools/contracts/sync-public-contracts.mjs [--root <repository-root>]")
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} is missing: ${filePath}`)
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch (error) {
    throw new Error(`${label} is malformed: ${error.message}`)
  }
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function validateOpenApi(value) {
  if (value === null || Array.isArray(value) || typeof value !== "object" || typeof value.openapi !== "string" || value.openapi.length === 0) {
    throw new Error("OpenAPI must be an object with a non-empty openapi version")
  }
}

function validateErrorCodes(value) {
  if (!Array.isArray(value)) {
    throw new Error("ErrorCode contract must be an array")
  }
  const codes = new Set()
  for (const errorCode of value) {
    const keys = Object.keys(errorCode ?? {}).sort()
    if (
      errorCode === null ||
      Array.isArray(errorCode) ||
      typeof errorCode !== "object" ||
      JSON.stringify(keys) !== JSON.stringify([...errorCodeKeys].sort()) ||
      typeof errorCode.code !== "string" ||
      errorCode.code.length === 0 ||
      !Number.isInteger(errorCode.httpStatus) ||
      errorCode.httpStatus < 100 ||
      errorCode.httpStatus > 599 ||
      typeof errorCode.defaultUserMessage !== "string" ||
      !["USER", "DEVELOPER"].includes(errorCode.kind)
    ) {
      throw new Error("ErrorCode contract entry has an invalid shape")
    }
    if (codes.has(errorCode.code)) {
      throw new Error(`Duplicate ErrorCode code: ${errorCode.code}`)
    }
    codes.add(errorCode.code)
  }
}

export function syncPublicContracts(root) {
  const openapi = readJson(path.join(root, "back", "build", "openapi", "openapi.json"), "OpenAPI")
  const errorCodes = readJson(path.join(root, "back", "build", "public-api", "error-codes.json"), "ErrorCode contract")
  validateOpenApi(openapi)
  validateErrorCodes(errorCodes)

  const contractsDir = path.join(root, "contracts", "public-api")
  fs.mkdirSync(contractsDir, { recursive: true })
  fs.writeFileSync(path.join(contractsDir, "openapi.json"), canonicalJson(openapi))
  fs.writeFileSync(
    path.join(contractsDir, "error-codes.json"),
    canonicalJson([...errorCodes].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))),
  )
  writePublicManifest(contractsDir)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncPublicContracts(resolveRoot(process.argv.slice(2)))
}
