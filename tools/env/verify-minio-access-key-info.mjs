#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const scriptPath = fileURLToPath(import.meta.url)

const sortablePolicyArrays = new Set(["Action", "Resource", "Statement"])

const canonicalize = (value, ownerKey = "") => {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => canonicalize(item))
    return sortablePolicyArrays.has(ownerKey)
      ? normalized.toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      : normalized
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key], key)]),
    )
  }
  return value
}

const parseJsonFile = (filePath, label) => {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"))
  } catch {
    throw new Error(`${label} must contain valid JSON`)
  }
}

export const verifyPolicy = ({ info, expectedPolicy }) => {
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new Error("access-key info must be a JSON object")
  }
  if (!info.policy || typeof info.policy !== "object" || Array.isArray(info.policy)) {
    throw new Error("access-key info must contain a structured inline policy")
  }
  const actual = JSON.stringify(canonicalize(info.policy))
  const expected = JSON.stringify(canonicalize(expectedPolicy))
  if (actual !== expected) throw new Error("live inline policy differs from the tracked policy")
}

const main = () => {
  const [infoPath, expectedPolicyPath] = process.argv.slice(2)
  if (!infoPath || !expectedPolicyPath || process.argv.length !== 4) {
    throw new Error("usage: verify-minio-access-key-info.mjs <info.json> <policy.json>")
  }
  verifyPolicy({
    info: parseJsonFile(infoPath, "access-key info"),
    expectedPolicy: parseJsonFile(expectedPolicyPath, "tracked policy"),
  })
  console.log("[MINIO_SERVICE_IDENTITY] inline_policy_exact=true")
}

if (process.argv[1] === scriptPath) {
  try {
    main()
  } catch (error) {
    console.error(`[MINIO_SERVICE_IDENTITY_INVALID] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
