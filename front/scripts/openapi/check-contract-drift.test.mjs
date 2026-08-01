import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { gitEnvWithoutInheritedRepository } from "../contracts/import-platform-contracts.mjs"

const script = fileURLToPath(new URL("./check-contract-drift.mjs", import.meta.url))
const generatedFile = "packages/shared-contracts/src/generated/backend-openapi.d.ts"

const git = (cwd, args) => execFileSync(
  "git",
  ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-C", cwd, ...args],
  { encoding: "utf8", env: gitEnvWithoutInheritedRepository() },
)

// The script regenerates the types before diffing them. That step needs the real toolchain,
// so stub it out: what is under test is whether the diff still sees the repository.
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-drift-"))
  const front = path.join(root, "front")
  const generated = path.join(front, generatedFile)
  await fs.mkdir(path.dirname(generated), { recursive: true })
  await fs.writeFile(generated, "export type Committed = 1\n")

  const bin = path.join(root, "bin")
  await fs.mkdir(bin, { recursive: true })
  const yarn = path.join(bin, "yarn")
  await fs.writeFile(yarn, "#!/bin/sh\nexit 0\n")
  await fs.chmod(yarn, 0o755)

  git(root, ["init", "--initial-branch=main"])
  git(root, ["config", "user.email", "test@example.com"])
  git(root, ["config", "user.name", "Test"])
  git(root, ["add", "front"])
  git(root, ["commit", "-m", "generated types"])

  return { root, front, generated, bin }
}

function runDriftCheck({ front, bin }, inherited = {}) {
  return spawnSync(process.execPath, [script], {
    cwd: front,
    encoding: "utf8",
    env: {
      ...gitEnvWithoutInheritedRepository(),
      ...inherited,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    },
  })
}

// Exactly what Git exports to a hook in a linked worktree, measured on this repository: an
// absolute GIT_DIR and GIT_INDEX_FILE, and nothing else. GIT_WORK_TREE must not be added
// here: it would give git a prefix for the current directory and hide the defect this pins.
function hookEnvironment(root) {
  const gitDirectory = path.join(root, ".git")
  return {
    GIT_DIR: gitDirectory,
    GIT_INDEX_FILE: path.join(gitDirectory, "index"),
  }
}

test("reports no drift when the generated file matches the commit", async (t) => {
  const context = await fixture()
  t.after(() => fs.rm(context.root, { recursive: true, force: true }))

  const result = runDriftCheck(context)

  assert.equal(result.status, 0)
  assert.match(result.stdout, /generated types are up-to-date/)
})

test("detects drift in the generated file", async (t) => {
  const context = await fixture()
  t.after(() => fs.rm(context.root, { recursive: true, force: true }))
  await fs.writeFile(context.generated, "export type Drifted = 2\n")

  const result = runDriftCheck(context)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /OpenAPI 계약 타입 드리프트를 감지했습니다/)
})

test("detects drift under the repository environment Git exports to hooks", async (t) => {
  const context = await fixture()
  t.after(() => fs.rm(context.root, { recursive: true, force: true }))
  await fs.writeFile(context.generated, "export type Drifted = 2\n")

  const result = runDriftCheck(context, hookEnvironment(context.root))

  assert.equal(result.status, 1)
  assert.match(result.stderr, /OpenAPI 계약 타입 드리프트를 감지했습니다/)
  assert.doesNotMatch(result.stdout, /generated types are up-to-date/)
})
