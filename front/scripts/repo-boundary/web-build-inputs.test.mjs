import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

const frontRoot = path.resolve(import.meta.dirname, "../..")
const policySource = fs.readFileSync(path.join(frontRoot, "src/libs/legal/serverPolicySource.ts"), "utf8")
const runtimeGuardSource = fs.readFileSync(path.join(frontRoot, "scripts/compare-runtime-guard-metrics.mjs"), "utf8")
const legalPolicyE2eSource = fs.readFileSync(path.join(frontRoot, "e2e/legal-policy-pages.spec.ts"), "utf8")
const ignoreScript = path.join(frontRoot, "scripts/vercel/should-ignore-build.mjs")

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" })

const runIgnoreCommand = (cwd) => spawnSync(process.execPath, [ignoreScript], { cwd, encoding: "utf8" })

const createGitFixture = ({ extracted = false } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-ignore-build-"))
  const fixture = extracted ? root : path.join(root, "front")
  git(root, ["init", "--initial-branch=main"])
  git(root, ["config", "user.email", "test@example.com"])
  git(root, ["config", "user.name", "Test"])
  fs.mkdirSync(path.join(fixture, "src"), { recursive: true })
  fs.writeFileSync(path.join(fixture, "src", "page.tsx"), "export {}\n")
  git(root, ["add", "."])
  git(root, ["commit", "-m", "initial"])
  return { extracted, fixture, root }
}

const commit = (root, file, content) => {
  const filePath = path.join(root, file)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  git(root, ["add", file])
  git(root, ["commit", "-m", "change"])
}

test("Web build inputs stay inside the future Web root", () => {
  assert.equal(fs.existsSync(path.join(frontRoot, "legal/policies")), true)
  assert.equal(fs.existsSync(path.join(frontRoot, "legal/schemas/legal-policy.schema.json")), true)
  assert.equal(fs.existsSync(path.join(frontRoot, "quality/performance/runtime-guard-baseline.json")), true)
  assert.doesNotMatch(policySource, /\.\.[/\\](legal|back|deploy|infra|perf)/)
  assert.doesNotMatch(runtimeGuardSource, /\.\.[/\\](legal|back|deploy|infra|perf)/)
  assert.doesNotMatch(legalPolicyE2eSource, /process\.cwd\(\),\s*"\.\.",\s*"legal"/)
})

test("Vercel ignore command builds the first commit", (t) => {
  for (const extracted of [false, true]) {
    const { fixture, root } = createGitFixture({ extracted })
    t.after(() => fs.rmSync(root, { force: true, recursive: true }))
    assert.equal(runIgnoreCommand(fixture).status, 1, `extracted=${extracted}`)
  }
})

test("Vercel ignore command builds Web runtime, contract, legal, and config changes", (t) => {
  for (const extracted of [false, true]) {
    for (const file of [
      "front/src/page.tsx",
      "front/contracts/platform/openapi.json",
      "front/config/env.contract.json",
      "front/legal/policies/privacy.yaml",
      "front/quality/performance/runtime-guard-baseline.json",
      "front/vercel.json",
    ]) {
      const webFixture = createGitFixture({ extracted })
      const relativeFile = extracted ? file.slice("front/".length) : file
      t.after(() => fs.rmSync(webFixture.root, { force: true, recursive: true }))
      commit(webFixture.root, relativeFile, "changed\n")
      assert.equal(runIgnoreCommand(webFixture.fixture).status, 1, `${file} extracted=${extracted}`)
    }
  }
})

test("Vercel ignore command ignores unrelated docs", (t) => {
  for (const extracted of [false, true]) {
    const docsFixture = createGitFixture({ extracted })
    t.after(() => fs.rmSync(docsFixture.root, { force: true, recursive: true }))
    commit(docsFixture.root, "docs/guide.md", "guide\n")
    assert.equal(runIgnoreCommand(docsFixture.fixture).status, 0, `extracted=${extracted}`)
  }
})
