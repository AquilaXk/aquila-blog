import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SHA256 = /^[a-f0-9]{64}$/
const COMMIT = /^[a-f0-9]{40}$/
const LOCK_KEYS = ["artifacts", "contract", "sourceCommit", "sourceRepository", "version"]
const ARTIFACT_KEYS = ["path", "sha256"]
const ARTIFACT_NAMES = ["errorCodes", "openapi"]
const ERROR_CODE_KEYS = ["code", "defaultUserMessage", "httpStatus", "kind"]

function fail(message) {
  throw new Error(`[platform-contracts] ${message}`)
}

function hasExactKeys(value, keys) {
  return value !== null
    && !Array.isArray(value)
    && typeof value === "object"
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function expectedPath(name) {
  return name === "openapi" ? "openapi.json" : "error-codes.json"
}

export function validateErrorCodes(value) {
  if (!Array.isArray(value)) {
    fail("error-codes.json must be an array")
  }

  const codes = new Set()
  for (const item of value) {
    const valid = hasExactKeys(item, ERROR_CODE_KEYS)
      && typeof item.code === "string"
      && item.code.length > 0
      && Number.isInteger(item.httpStatus)
      && item.httpStatus >= 100
      && item.httpStatus <= 599
      && typeof item.defaultUserMessage === "string"
      && ["USER", "DEVELOPER"].includes(item.kind)
    if (!valid) {
      fail("ErrorCode contract entry has an invalid shape")
    }
    if (codes.has(item.code)) {
      fail(`Duplicate ErrorCode code: ${item.code}`)
    }
    codes.add(item.code)
  }
}

export function validateLock(lock) {
  const validLock = hasExactKeys(lock, LOCK_KEYS)
    && lock.version === 1
    && lock.contract === "aquila-public-api"
    && lock.sourceRepository === "AquilaXk/aquila-blog"
    && typeof lock.sourceCommit === "string"
    && COMMIT.test(lock.sourceCommit)
    && hasExactKeys(lock.artifacts, ARTIFACT_NAMES)
  if (!validLock) {
    fail("manifest.lock.json has an invalid shape or source identity")
  }

  for (const name of ARTIFACT_NAMES) {
    const artifact = lock.artifacts[name]
    const validArtifact = hasExactKeys(artifact, ARTIFACT_KEYS)
      && artifact.path === expectedPath(name)
      && typeof artifact.sha256 === "string"
      && SHA256.test(artifact.sha256)
    if (!validArtifact) {
      fail(`manifest.lock.json has an invalid ${name} artifact`)
    }
  }
}

async function readLock(lockPath) {
  try {
    return JSON.parse(await fs.readFile(lockPath, "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail("manifest.lock.json is missing")
    }
    fail(`manifest.lock.json is malformed: ${error.message}`)
  }
}

async function readArtifact(directory, artifact) {
  try {
    return await fs.readFile(path.join(directory, artifact.path))
  } catch {
    fail(`${artifact.path} is missing`)
  }
}

function validateErrorCodeBytes(bytes) {
  try {
    validateErrorCodes(JSON.parse(bytes.toString("utf8")))
  } catch (error) {
    if (error.message?.startsWith("[platform-contracts]")) {
      throw error
    }
    fail(`error-codes.json is malformed: ${error.message}`)
  }
}

export async function verifyPlatformContracts({ directory }) {
  const lock = await readLock(path.join(directory, "manifest.lock.json"))
  validateLock(lock)

  for (const [name, artifact] of Object.entries(lock.artifacts)) {
    const bytes = await readArtifact(directory, artifact)
    if (sha256(bytes) !== artifact.sha256) {
      fail(`${artifact.path} hash does not match manifest.lock.json`)
    }
    if (name === "errorCodes") {
      validateErrorCodeBytes(bytes)
    }
  }
}

function parseArgs(args) {
  if (args.length === 0) {
    return { directory: path.resolve("contracts/platform") }
  }
  if (args.length === 2 && args[0] === "--directory") {
    return { directory: path.resolve(args[1]) }
  }
  fail("Usage: node scripts/contracts/verify-platform-contracts.mjs [--directory <path>]")
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyPlatformContracts(parseArgs(process.argv.slice(2)))
    .then(() => console.log("[platform-contracts] verified"))
    .catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
}
