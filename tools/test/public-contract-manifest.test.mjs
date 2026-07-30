import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const syncScript = path.join(repoRoot, "tools", "contracts", "sync-public-contracts.mjs")
const checkScript = path.join(repoRoot, "tools", "contracts", "check-public-contracts.mjs")

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`)
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aquila-public-contract-"))
  writeJson(path.join(root, "back/build/openapi/openapi.json"), {
    paths: { "/posts": { get: { summary: "posts" } } },
    openapi: "3.1.0",
    info: { title: "Aquila API", version: "1" },
  })
  writeJson(path.join(root, "back/build/public-api/error-codes.json"), [
    { code: "500-1", httpStatus: 500, defaultUserMessage: "서버 오류", kind: "DEVELOPER" },
    { code: "400-1", httpStatus: 400, defaultUserMessage: "잘못된 요청", kind: "USER" },
  ])
  return root
}

function run(script, root) {
  return spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" })
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

test("sync writes 2-space newline artifacts and raw-byte manifest hashes", () => {
  const root = createFixture()
  try {
    const result = run(syncScript, root)
    assert.equal(result.status, 0, result.stderr)

    const openapiPath = path.join(root, "contracts/public-api/openapi.json")
    const errorCodesPath = path.join(root, "contracts/public-api/error-codes.json")
    const manifestPath = path.join(root, "contracts/public-api/manifest.json")
    assert.match(fs.readFileSync(openapiPath, "utf8"), /^\{\n  "paths":/)
    assert.match(fs.readFileSync(openapiPath, "utf8"), /\n$/)
    assert.deepEqual(JSON.parse(fs.readFileSync(errorCodesPath, "utf8")).map(({ code }) => code), ["400-1", "500-1"])

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    assert.deepEqual(manifest, {
      version: 1,
      contract: "aquila-public-api",
      artifacts: {
        openapi: { path: "openapi.json", sha256: sha256(openapiPath) },
        errorCodes: { path: "error-codes.json", sha256: sha256(errorCodesPath) },
      },
    })
    assert.match(manifest.artifacts.openapi.sha256, /^[a-f0-9]{64}$/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("sync rejects missing or malformed OpenAPI and invalid ErrorCode input", () => {
  const root = createFixture()
  try {
    fs.rmSync(path.join(root, "back/build/openapi/openapi.json"))
    assert.notEqual(run(syncScript, root).status, 0)

    fs.mkdirSync(path.join(root, "back/build/openapi"), { recursive: true })
    fs.writeFileSync(path.join(root, "back/build/openapi/openapi.json"), "{")
    assert.notEqual(run(syncScript, root).status, 0)

    writeJson(path.join(root, "back/build/openapi/openapi.json"), { openapi: "3.1.0" })
    writeJson(path.join(root, "back/build/public-api/error-codes.json"), [
      { code: "400-1", httpStatus: 400, defaultUserMessage: "bad", kind: "USER" },
      { code: "400-1", httpStatus: 400, defaultUserMessage: "bad", kind: "USER" },
    ])
    assert.notEqual(run(syncScript, root).status, 0)

    writeJson(path.join(root, "back/build/public-api/error-codes.json"), [
      { code: "400-1", httpStatus: "400", defaultUserMessage: "bad", kind: "USER" },
    ])
    assert.notEqual(run(syncScript, root).status, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("checker synchronizes then rejects an uncommitted contract update", () => {
  const root = createFixture()
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root })
    execFileSync("git", ["config", "user.email", "contract@example.test"], { cwd: root })
    execFileSync("git", ["config", "user.name", "Contract Test"], { cwd: root })
    assert.equal(run(checkScript, root).status, 0)
    execFileSync("git", ["add", "contracts/public-api"], { cwd: root })
    execFileSync("git", ["commit", "--quiet", "-m", "contract"], { cwd: root })
    assert.equal(run(checkScript, root).status, 0)

    writeJson(path.join(root, "back/build/openapi/openapi.json"), { openapi: "3.1.1" })
    assert.notEqual(run(checkScript, root).status, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
