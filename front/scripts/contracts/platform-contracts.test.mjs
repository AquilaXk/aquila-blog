import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  gitEnvWithoutInheritedRepository,
  inheritedGitEnvKeys,
  importPlatformContracts,
} from "./import-platform-contracts.mjs"
import { verifyPlatformContracts } from "./verify-platform-contracts.mjs"

const sourceRepository = "AquilaXk/aquila-blog"
const sha256 = (value) => createHash("sha256").update(value).digest("hex")
// env defaults to process.env but stays a parameter, so the inherited-environment test can
// hand a polluted environment to one call instead of mutating the environment of the run.
const git = (cwd, args, env = process.env) => execFileSync(
  "git",
  ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-C", cwd, ...args],
  { encoding: "utf8", env: gitEnvWithoutInheritedRepository(env) },
)

async function fixture(env = process.env) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "platform-contracts-"))
  const source = path.join(root, "contracts", "public-api")
  const output = path.join(root, "output")
  await fs.mkdir(source, { recursive: true })
  const openapi = Buffer.from('{"openapi":"3.0.1","paths":{}}\n')
  const errorCodes = Buffer.from('[{"code":"NOT_FOUND","httpStatus":404,"defaultUserMessage":"missing","kind":"USER"}]\n')
  await fs.writeFile(path.join(source, "openapi.json"), openapi)
  await fs.writeFile(path.join(source, "error-codes.json"), errorCodes)
  await fs.writeFile(path.join(source, "manifest.json"), `${JSON.stringify({
    version: 1,
    contract: "aquila-public-api",
    artifacts: {
      openapi: { path: "openapi.json", sha256: sha256(openapi) },
      errorCodes: { path: "error-codes.json", sha256: sha256(errorCodes) },
    },
  }, null, 2)}\n`)
  git(root, ["init", "--initial-branch=main"], env)
  git(root, ["remote", "add", "origin", "https://github.com/AquilaXk/aquila-blog.git"], env)
  git(root, ["config", "user.email", "test@example.com"], env)
  git(root, ["config", "user.name", "Test"], env)
  git(root, ["add", "contracts/public-api"], env)
  git(root, ["commit", "-m", "public contract"], env)
  const sourceCommit = git(root, ["rev-parse", "HEAD"], env).trim()
  return { root, source, output, sourceCommit }
}

async function decoyRepository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "platform-contracts-decoy-"))
  await fs.writeFile(path.join(root, "decoy.txt"), "decoy\n")
  git(root, ["init", "--initial-branch=main"])
  git(root, ["remote", "add", "origin", "https://github.com/example/decoy.git"])
  git(root, ["config", "user.email", "test@example.com"])
  git(root, ["config", "user.name", "Test"])
  git(root, ["add", "decoy.txt"])
  git(root, ["commit", "-m", "decoy"])

  // A leaked GIT_OBJECT_DIRECTORY or GIT_COMMON_DIR leaves the remote, HEAD and the work
  // tree alone and only writes the temporary repository's objects in here, so the object
  // store has to be part of what "untouched" means for this repository.
  const state = () => ({
    origin: git(root, ["remote", "get-url", "origin"]),
    head: git(root, ["rev-parse", "HEAD"]),
    refs: git(root, ["show-ref"]),
    status: git(root, ["status", "--porcelain"]),
    objects: git(root, ["count-objects", "-v"]),
  })
  return { root, state }
}

const importModule = new URL("./import-platform-contracts.mjs", import.meta.url).href
const verifyModule = new URL("./verify-platform-contracts.mjs", import.meta.url).href

// A hook runs these scripts in a separate process that already carries the inherited
// environment, so reproduce that rather than mutating the environment of this test run.
async function importInChildProcess({ source, output, sourceCommit }, env) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "platform-contracts-runner-"))
  const runner = path.join(directory, "run-import.mjs")
  await fs.writeFile(runner, [
    `import { importPlatformContracts } from ${JSON.stringify(importModule)}`,
    `import { verifyPlatformContracts } from ${JSON.stringify(verifyModule)}`,
    "const [source, output, sourceRepository, sourceCommit] = process.argv.slice(2)",
    "await importPlatformContracts({ source, output, sourceRepository, sourceCommit })",
    "await verifyPlatformContracts({ directory: output })",
    "",
  ].join("\n"))

  const result = spawnSync(
    process.execPath,
    [runner, source, output, sourceRepository, sourceCommit],
    { encoding: "utf8", env },
  )
  await fs.rm(directory, { recursive: true, force: true })
  return result
}

test("imports verified canonical bytes and creates a pinned lock", async (t) => {
  const { root, source, output, sourceCommit } = await fixture()
  t.after(() => fs.rm(root, { recursive: true, force: true }))

  await importPlatformContracts({ source, output, sourceRepository, sourceCommit })

  assert.deepEqual(JSON.parse(await fs.readFile(path.join(output, "manifest.lock.json"), "utf8")), {
    version: 1,
    sourceRepository,
    sourceCommit,
    contract: "aquila-public-api",
    artifacts: {
      openapi: { path: "openapi.json", sha256: sha256(Buffer.from('{"openapi":"3.0.1","paths":{}}\n')) },
      errorCodes: { path: "error-codes.json", sha256: sha256(Buffer.from('[{"code":"NOT_FOUND","httpStatus":404,"defaultUserMessage":"missing","kind":"USER"}]\n')) },
    },
  })
  await verifyPlatformContracts({ directory: output })
})

test("rejects a duplicate error code before changing the output", async (t) => {
  const { root, source, output, sourceCommit } = await fixture()
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, "sentinel"), "keep")
  const duplicate = '[{"code":"DUP","httpStatus":400,"defaultUserMessage":"a","kind":"USER"},{"code":"DUP","httpStatus":400,"defaultUserMessage":"b","kind":"USER"}]\n'
  await fs.writeFile(path.join(source, "error-codes.json"), duplicate)
  const manifestPath = path.join(source, "manifest.json")
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
  manifest.artifacts.errorCodes.sha256 = sha256(Buffer.from(duplicate))
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  await assert.rejects(
    importPlatformContracts({ source, output, sourceRepository, sourceCommit }),
    /Duplicate ErrorCode code: DUP/,
  )
  assert.equal(await fs.readFile(path.join(output, "sentinel"), "utf8"), "keep")
  await assert.rejects(verifyPlatformContracts({ directory: output }), /manifest.lock.json is missing/)
})

test("rejects an unauthorized source identity before changing the output", async (t) => {
  const { root, source, output, sourceCommit } = await fixture()
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, "sentinel"), "keep")

  await assert.rejects(importPlatformContracts({ source, output, sourceRepository: "other/repository", sourceCommit }), /source repository or commit is invalid/)
  await assert.rejects(importPlatformContracts({ source, output, sourceRepository, sourceCommit: "invalid" }), /source repository or commit is invalid/)
  assert.equal(await fs.readFile(path.join(output, "sentinel"), "utf8"), "keep")
})

test("rejects a source Git repository whose origin does not match the lock identity", async (t) => {
  const { root, source, output, sourceCommit } = await fixture()
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  git(root, ["remote", "set-url", "origin", "https://github.com/example/aquila-blog.git"])

  await assert.rejects(
    importPlatformContracts({ source, output, sourceRepository, sourceCommit }),
    /source Git origin does not match source repository/,
  )
})

test("rejects malformed canonical manifest identity before changing the output", async (t) => {
  const { root, source, output, sourceCommit } = await fixture()
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const manifestPath = path.join(source, "manifest.json")

  for (const mutate of [
    (manifest) => { manifest.contract = "other-contract" },
    (manifest) => { manifest.version = 2 },
    (manifest) => { manifest.extra = true },
  ]) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
    mutate(manifest)
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, "sentinel"), "keep")

    await assert.rejects(
      importPlatformContracts({ source, output, sourceRepository, sourceCommit }),
      /source manifest has an invalid identity or shape/,
    )
    assert.equal(await fs.readFile(path.join(output, "sentinel"), "utf8"), "keep")
    await fs.rm(output, { recursive: true, force: true })
    await fs.writeFile(manifestPath, `${JSON.stringify({
      version: 1,
      contract: "aquila-public-api",
      artifacts: JSON.parse(await fs.readFile(path.join(source, "manifest.json"), "utf8")).artifacts,
    }, null, 2)}\n`)
  }
})

test("rejects a declared source artifact hash mismatch before changing the output", async (t) => {
  const { root, source, output, sourceCommit } = await fixture()
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, "sentinel"), "keep")
  const manifestPath = path.join(source, "manifest.json")
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
  manifest.artifacts.openapi.sha256 = "0".repeat(64)
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  await assert.rejects(importPlatformContracts({ source, output, sourceRepository, sourceCommit }), /source artifact hash does not match manifest/)
  assert.equal(await fs.readFile(path.join(output, "sentinel"), "utf8"), "keep")
})

test("rejects a local artifact whose bytes no longer match the lock", async (t) => {
  const { root, source, output, sourceCommit } = await fixture()
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await importPlatformContracts({ source, output, sourceRepository, sourceCommit })
  await fs.appendFile(path.join(output, "openapi.json"), " ")

  await assert.rejects(verifyPlatformContracts({ directory: output }), /hash does not match/)
})

test("rejects duplicate local error codes whose bytes match the lock", async (t) => {
  const { root, source, output, sourceCommit } = await fixture()
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await importPlatformContracts({ source, output, sourceRepository, sourceCommit })
  const duplicate = '[{"code":"DUP","httpStatus":400,"defaultUserMessage":"a","kind":"USER"},{"code":"DUP","httpStatus":400,"defaultUserMessage":"b","kind":"USER"}]\n'
  await fs.writeFile(path.join(output, "error-codes.json"), duplicate)
  const lockPath = path.join(output, "manifest.lock.json")
  const lock = JSON.parse(await fs.readFile(lockPath, "utf8"))
  lock.artifacts.errorCodes.sha256 = sha256(Buffer.from(duplicate))
  await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)

  await assert.rejects(verifyPlatformContracts({ directory: output }), /Duplicate ErrorCode code: DUP/)
})

test("rejects a well-formed source commit that does not exist", async (t) => {
  const { root, source, output } = await fixture()
  t.after(() => fs.rm(root, { recursive: true, force: true }))

  await assert.rejects(
    importPlatformContracts({ source, output, sourceRepository, sourceCommit: "0".repeat(40) }),
    /source commit does not contain canonical contract/,
  )
})

test("rejects canonical source bytes changed after the pinned commit", async (t) => {
  const { root, source, output, sourceCommit } = await fixture()
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const openapi = Buffer.from('{"openapi":"3.1.0","paths":{}}\n')
  await fs.writeFile(path.join(source, "openapi.json"), openapi)
  const manifestPath = path.join(source, "manifest.json")
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
  manifest.artifacts.openapi.sha256 = sha256(openapi)
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  await assert.rejects(
    importPlatformContracts({ source, output, sourceRepository, sourceCommit }),
    /source contract bytes do not match source commit/,
  )
})

test("ignores the repository environment Git exports to hooks in a linked worktree", async (t) => {
  const decoy = await decoyRepository()
  t.after(() => fs.rm(decoy.root, { recursive: true, force: true }))
  const untouched = decoy.state()
  const gitDirectory = path.join(decoy.root, ".git")
  const inherited = {
    ...process.env,
    GIT_DIR: gitDirectory,
    GIT_INDEX_FILE: path.join(gitDirectory, "index"),
    GIT_WORK_TREE: decoy.root,
    GIT_COMMON_DIR: gitDirectory,
    GIT_OBJECT_DIRECTORY: path.join(gitDirectory, "objects"),
  }

  const { root, source, output, sourceCommit } = await fixture(inherited)
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const imported = await importInChildProcess({ source, output, sourceCommit }, inherited)

  assert.equal(imported.status, 0, imported.stderr)
  assert.deepEqual(decoy.state(), untouched)
})

test("strips every repository-scoped variable git reports, and nothing else", () => {
  const keys = inheritedGitEnvKeys()

  assert.ok(keys.includes("GIT_DIR"), "git must report GIT_DIR as repository-scoped")
  assert.deepEqual(
    gitEnvWithoutInheritedRepository({
      ...Object.fromEntries(keys.map((key) => [key, "leaked"])),
      PATH: "/usr/bin",
    }),
    { PATH: "/usr/bin" },
  )
})
