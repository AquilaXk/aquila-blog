import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { realpathSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { validateErrorCodes, validateLock } from "./verify-platform-contracts.mjs"

const SOURCE_REPOSITORY = "AquilaXk/aquila-blog"
const COMMIT = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const MANIFEST_KEYS = ["artifacts", "contract", "version"]
const ARTIFACT_KEYS = ["path", "sha256"]
const SOURCE_ARTIFACTS = [
  ["openapi", "openapi.json"],
  ["errorCodes", "error-codes.json"],
]

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

async function readJson(filePath, label) {
  try {
    const bytes = await fs.readFile(filePath)
    return { bytes, value: JSON.parse(bytes.toString("utf8")) }
  } catch (error) {
    fail(`${label} is malformed or missing: ${error.message}`)
  }
}

function validateSourceIdentity(sourceRepository, sourceCommit) {
  if (sourceRepository !== SOURCE_REPOSITORY || !COMMIT.test(sourceCommit)) {
    fail("source repository or commit is invalid")
  }
}

function validateSourceCommit(source, sourceCommit, files) {
  let repositoryRoot
  try {
    repositoryRoot = execFileSync("git", ["-C", source, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    fail("source directory is not inside a Git repository")
  }

  const sourceDirectory = path.relative(realpathSync(repositoryRoot), realpathSync(source))
  if (path.isAbsolute(sourceDirectory) || sourceDirectory === ".." || sourceDirectory.startsWith(`..${path.sep}`)) {
    fail("source directory is outside its Git repository")
  }

  for (const [file, bytes] of files) {
    const gitPath = [sourceDirectory.split(path.sep).join("/"), file].filter(Boolean).join("/")
    let committed
    try {
      committed = execFileSync("git", ["-C", repositoryRoot, "show", `${sourceCommit}:${gitPath}`], {
        encoding: null,
        stdio: ["ignore", "pipe", "ignore"],
      })
    } catch {
      fail(`source commit does not contain canonical contract: ${file}`)
    }
    if (!committed.equals(bytes)) {
      fail(`source contract bytes do not match source commit: ${file}`)
    }
  }
}

function validateManifest(manifest) {
  const valid = hasExactKeys(manifest, MANIFEST_KEYS)
    && manifest.version === 1
    && manifest.contract === "aquila-public-api"
    && hasExactKeys(manifest.artifacts, ["errorCodes", "openapi"])
  if (!valid) {
    fail("source manifest has an invalid identity or shape")
  }
}

function validateSourceArtifact(artifact, name, expectedPath) {
  const valid = hasExactKeys(artifact, ARTIFACT_KEYS)
    && artifact.path === expectedPath
    && typeof artifact.sha256 === "string"
    && SHA256.test(artifact.sha256)
  if (!valid) {
    fail(`source manifest has an invalid ${name} artifact`)
  }
}

async function readSourceArtifacts(source, manifest) {
  const artifacts = {}
  for (const [name, expectedPath] of SOURCE_ARTIFACTS) {
    const artifact = manifest.artifacts[name]
    validateSourceArtifact(artifact, name, expectedPath)

    let bytes
    try {
      bytes = await fs.readFile(path.join(source, artifact.path))
    } catch {
      fail(`source artifact is missing: ${artifact.path}`)
    }
    if (sha256(bytes) !== artifact.sha256) {
      fail(`source artifact hash does not match manifest: ${artifact.path}`)
    }
    artifacts[name] = { ...artifact, bytes }
  }
  return artifacts
}

function validateOpenApi(bytes) {
  try {
    const openapi = JSON.parse(bytes.toString("utf8"))
    const valid = openapi !== null
      && !Array.isArray(openapi)
      && typeof openapi === "object"
      && typeof openapi.openapi === "string"
      && openapi.openapi.length > 0
    if (!valid) {
      fail("OpenAPI artifact has an invalid shape")
    }
  } catch (error) {
    if (error.message?.startsWith("[platform-contracts]")) {
      throw error
    }
    fail(`OpenAPI artifact is malformed: ${error.message}`)
  }
}

function validateErrorCodeArtifact(bytes) {
  try {
    validateErrorCodes(JSON.parse(bytes.toString("utf8")))
  } catch (error) {
    if (error.message?.startsWith("[platform-contracts]")) {
      throw error
    }
    fail(`error-codes.json is malformed: ${error.message}`)
  }
}

function createLock(manifest, artifacts, sourceRepository, sourceCommit) {
  return {
    version: 1,
    sourceRepository,
    sourceCommit,
    contract: manifest.contract,
    artifacts: Object.fromEntries(
      Object.entries(artifacts).map(([name, artifact]) => [name, {
        path: artifact.path,
        sha256: artifact.sha256,
      }]),
    ),
  }
}

export async function importPlatformContracts({ source, output, sourceRepository, sourceCommit }) {
  validateSourceIdentity(sourceRepository, sourceCommit)
  const { bytes: manifestBytes, value: manifest } = await readJson(path.join(source, "manifest.json"), "source manifest")
  validateManifest(manifest)

  const artifacts = await readSourceArtifacts(source, manifest)
  validateOpenApi(artifacts.openapi.bytes)
  validateErrorCodeArtifact(artifacts.errorCodes.bytes)
  validateSourceCommit(source, sourceCommit, [
    ["manifest.json", manifestBytes],
    ...SOURCE_ARTIFACTS.map(([name, file]) => [file, artifacts[name].bytes]),
  ])

  const lock = createLock(manifest, artifacts, sourceRepository, sourceCommit)
  validateLock(lock)

  await fs.mkdir(output, { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(output, "openapi.json"), artifacts.openapi.bytes),
    fs.writeFile(path.join(output, "error-codes.json"), artifacts.errorCodes.bytes),
    fs.writeFile(path.join(output, "manifest.lock.json"), `${JSON.stringify(lock, null, 2)}\n`),
  ])
}

function usage() {
  fail("Usage: node scripts/contracts/import-platform-contracts.mjs --source <dir> --output <dir> --source-repository AquilaXk/aquila-blog --source-commit <40-hex>")
}

function parseArgs(args) {
  const values = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    const known = ["--source", "--output", "--source-repository", "--source-commit"].includes(key)
    if (!known || !value || values[key]) {
      usage()
    }
    values[key] = value
  }
  if (Object.keys(values).length !== 4) {
    usage()
  }
  return {
    source: path.resolve(values["--source"]),
    output: path.resolve(values["--output"]),
    sourceRepository: values["--source-repository"],
    sourceCommit: values["--source-commit"],
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  importPlatformContracts(parseArgs(process.argv.slice(2)))
    .then(() => console.log("[platform-contracts] imported"))
    .catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
}
