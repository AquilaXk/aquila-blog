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
const summaryFixture = {
  version: 2,
  contract: "aquila-canonical-summary-fixtures",
  fixtures: [
    {
      id: "synthetic-contract-case",
      resolve: "create",
      title: "계약 테스트",
      content: "synthetic input",
      request: { summaryMode: "MANUAL", summary: "synthetic expected" },
      expected: {
        summary: "synthetic expected",
        source: "MANUAL",
        algorithmVersion: "manual-v1",
      },
      outcome: "RESOLVED",
    },
    {
      id: "synthetic-migrated-read",
      resolve: "read",
      title: "이전 글",
      content: "persisted content",
      persisted: {
        summary: "persisted summary",
        source: "MIGRATED",
        algorithmVersion: "legacy-frontmatter-v1",
      },
      expected: {
        summary: "persisted summary",
        source: "MIGRATED",
        algorithmVersion: "legacy-frontmatter-v1",
      },
      outcome: "RESOLVED",
    },
  ],
}

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
  writeJson(path.join(root, "contracts/public-api/summary-fixtures.json"), summaryFixture)
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
    const summaryFixturesPath = path.join(root, "contracts/public-api/summary-fixtures.json")
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
        summaryFixtures: { path: "summary-fixtures.json", sha256: sha256(summaryFixturesPath) },
      },
    })
    assert.match(manifest.artifacts.openapi.sha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(JSON.parse(fs.readFileSync(summaryFixturesPath, "utf8")), summaryFixture)
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

test("sync rejects an invalid canonical summary fixture before writing the manifest", () => {
  const root = createFixture()
  try {
    writeJson(path.join(root, "contracts/public-api/summary-fixtures.json"), {
      version: 1,
      contract: "aquila-canonical-summary-fixtures",
      fixtures: {},
    })
    assert.notEqual(run(syncScript, root).status, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("sync accepts persisted read values with different property order", () => {
  const root = createFixture()
  try {
    const reordered = structuredClone(summaryFixture)
    const readFixture = reordered.fixtures.find(({ resolve }) => resolve === "read")
    readFixture.expected = {
      algorithmVersion: readFixture.persisted.algorithmVersion,
      summary: readFixture.persisted.summary,
      source: readFixture.persisted.source,
    }
    writeJson(path.join(root, "contracts/public-api/summary-fixtures.json"), reordered)

    const result = run(syncScript, root)

    assert.equal(result.status, 0, result.stderr)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("checker rejects untracked and changed canonical contract artifacts", () => {
  const root = createFixture()
  try {
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "init", "--quiet"], { cwd: root })
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "config", "user.email", "contract@example.test"], { cwd: root })
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "config", "user.name", "Contract Test"], { cwd: root })
    assert.notEqual(run(checkScript, root).status, 0)
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "add", "contracts/public-api"], { cwd: root })
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "commit", "--quiet", "-m", "contract"], { cwd: root })
    assert.equal(run(checkScript, root).status, 0)

    writeJson(path.join(root, "back/build/openapi/openapi.json"), { openapi: "3.1.1" })
    assert.notEqual(run(checkScript, root).status, 0)
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "add", "contracts/public-api"], { cwd: root })
    assert.notEqual(run(checkScript, root).status, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("canonical OpenAPI and active k6 defaults use the current same-origin host", () => {
  const retiredHost = "https://api.blog.aquilaxk.site"
  const currentHost = "https://blog.aquilaxk.site"
  const openApi = JSON.parse(fs.readFileSync(path.join(repoRoot, "contracts/public-api/openapi.json"), "utf8"))
  const activeK6Surfaces = [
    "perf/k6/post-read-load.js",
    "perf/k6/post-read-chaos-smoke.js",
    "perf/k6/run-chaos-suite.sh",
    "perf/k6/cloud-playback-load.js",
    "perf/k6/cloud-upload-parts-load.js",
    "perf/k6/cloud-upload-5gb-measure.sh",
    "perf/k6/examples/cloud-playback.example.json",
    "perf/k6/README.md",
  ]

  assert.equal(openApi.servers[0].url, currentHost)
  assert.equal(JSON.stringify(openApi).includes(retiredHost), false)

  for (const surface of activeK6Surfaces) {
    const contents = fs.readFileSync(path.join(repoRoot, surface), "utf8")
    assert.equal(contents.includes(retiredHost), false, surface)
    assert.equal(contents.includes(currentHost), true, surface)
  }
})
