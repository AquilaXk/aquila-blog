import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { writePublicManifest } from "./write-public-manifest.mjs"

const errorCodeKeys = ["code", "httpStatus", "defaultUserMessage", "kind"]
const summaryResolveKinds = new Set(["create", "modify", "read"])
const summaryOutcomes = new Set(["RESOLVED", "MANUAL_SUMMARY_REQUIRED"])
const summaryModes = new Set(["MANUAL", "AUTO"])
const summarySources = new Set(["MANUAL", "LEADING_BLOCK", "EXTRACTED", "NONE", "MIGRATED"])

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

function isObject(value) {
  return value !== null && !Array.isArray(value) && typeof value === "object"
}

function exactKeys(value, expected) {
  return isObject(value) && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n")
}

function validateSummaryRequest(value) {
  if (!exactKeys(value, ["summaryMode", "summary"]) || (value.summaryMode !== null && !summaryModes.has(value.summaryMode)) || (value.summary !== null && typeof value.summary !== "string")) {
    throw new Error("Canonical summary fixture request has an invalid shape")
  }
}

function validateSummaryValue(value, label) {
  if (!exactKeys(value, ["summary", "source", "algorithmVersion"]) || typeof value.summary !== "string" || !summarySources.has(value.source) || typeof value.algorithmVersion !== "string" || value.algorithmVersion.length === 0) {
    throw new Error(`Canonical summary fixture ${label} value is invalid`)
  }
}

function validateSummaryFixtures(value) {
  if (!exactKeys(value, ["version", "contract", "fixtures"]) || value.version !== 2 || value.contract !== "aquila-canonical-summary-fixtures" || !Array.isArray(value.fixtures)) {
    throw new Error("Canonical summary fixture identity is invalid")
  }
  const ids = new Set()
  for (const fixture of value.fixtures) {
    const expectedKeys = ["id", "resolve", "title", "content", "outcome"]
    if (fixture?.request !== undefined) expectedKeys.push("request")
    if (fixture?.expected !== undefined) expectedKeys.push("expected")
    if (fixture?.existing !== undefined) expectedKeys.push("existing")
    if (fixture?.persisted !== undefined) expectedKeys.push("persisted")
    if (fixture?.retry !== undefined) expectedKeys.push("retry")
    if (!exactKeys(fixture, expectedKeys) || typeof fixture.id !== "string" || fixture.id.length === 0 || ids.has(fixture.id) || !summaryResolveKinds.has(fixture.resolve) || typeof fixture.title !== "string" || typeof fixture.content !== "string" || !summaryOutcomes.has(fixture.outcome)) {
      throw new Error("Canonical summary fixture has an invalid shape")
    }
    if (fixture.resolve === "read") {
      if (fixture.request !== undefined || fixture.existing !== undefined || fixture.retry !== undefined || fixture.persisted === undefined) {
        throw new Error("Canonical summary read fixture must not define executable input")
      }
      validateSummaryValue(fixture.persisted, "persisted")
      if (fixture.persisted.source !== "MIGRATED" || fixture.outcome !== "RESOLVED") {
        throw new Error("Canonical summary read fixture must preserve MIGRATED provenance")
      }
    } else {
      if (fixture.request === undefined || fixture.persisted !== undefined) {
        throw new Error("Executable canonical summary fixture input is invalid")
      }
      validateSummaryRequest(fixture.request)
    }
    if (fixture.existing !== undefined && (fixture.resolve !== "modify" || !exactKeys(fixture.existing, ["summary", "source"]) || typeof fixture.existing.summary !== "string" || !summarySources.has(fixture.existing.source))) {
      throw new Error("Canonical summary fixture existing value is invalid")
    }
    if (fixture.retry !== undefined) {
      if (fixture.resolve !== "create") throw new Error("Canonical summary fixture retry is incompatible with resolve")
      validateSummaryRequest(fixture.retry)
    }
    if (fixture.outcome === "RESOLVED") {
      validateSummaryValue(fixture.expected, "expected")
      if (fixture.resolve === "read" && JSON.stringify(fixture.persisted) !== JSON.stringify(fixture.expected)) {
        throw new Error("Canonical summary read fixture persisted and expected values must match")
      }
    } else if (fixture.expected !== undefined) {
      throw new Error("Rejected canonical summary fixture must not define an expected value")
    }
    if (fixture.resolve === "modify" && fixture.existing === undefined) throw new Error("Modified canonical summary fixture requires an existing value")
    ids.add(fixture.id)
  }
}

export function syncPublicContracts(root) {
  const openapi = readJson(path.join(root, "back", "build", "openapi", "openapi.json"), "OpenAPI")
  const errorCodes = readJson(path.join(root, "back", "build", "public-api", "error-codes.json"), "ErrorCode contract")
  const summaryFixtures = readJson(path.join(root, "contracts", "public-api", "summary-fixtures.json"), "Canonical summary fixture")
  validateOpenApi(openapi)
  validateErrorCodes(errorCodes)
  validateSummaryFixtures(summaryFixtures)

  const contractsDir = path.join(root, "contracts", "public-api")
  fs.mkdirSync(contractsDir, { recursive: true })
  fs.writeFileSync(path.join(contractsDir, "openapi.json"), canonicalJson(openapi))
  fs.writeFileSync(
    path.join(contractsDir, "error-codes.json"),
    canonicalJson([...errorCodes].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))),
  )
  fs.writeFileSync(path.join(contractsDir, "summary-fixtures.json"), canonicalJson(summaryFixtures))
  writePublicManifest(contractsDir)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncPublicContracts(resolveRoot(process.argv.slice(2)))
}
