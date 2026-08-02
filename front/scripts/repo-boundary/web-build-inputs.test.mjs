import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { load as loadYaml } from "js-yaml"

const frontRoot = path.resolve(import.meta.dirname, "../..")
const policySource = fs.readFileSync(path.join(frontRoot, "src/libs/legal/serverPolicySource.ts"), "utf8")
const runtimeGuardSource = fs.readFileSync(path.join(frontRoot, "scripts/compare-runtime-guard-metrics.mjs"), "utf8")
const legalPolicyE2eSource = fs.readFileSync(path.join(frontRoot, "e2e/legal-policy-pages.spec.ts"), "utf8")
const boundarySource = fs.readFileSync(path.join(frontRoot, "scripts/repo-boundary/check-web-boundary.mjs"), "utf8")

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" })

const createBoundaryFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-boundary-"))
  fs.mkdirSync(path.join(root, ".githooks"), { recursive: true })
  fs.mkdirSync(path.join(root, "scripts/repo-boundary"), { recursive: true })
  fs.mkdirSync(path.join(root, "src"), { recursive: true })
  fs.writeFileSync(path.join(root, ".githooks/pre-commit"), "unset $(git rev-parse --local-env-vars)\n")
  fs.copyFileSync(path.join(frontRoot, "scripts/repo-boundary/check-web-boundary.mjs"), path.join(root, "scripts/repo-boundary/check-web-boundary.mjs"))
  git(root, ["init", "--initial-branch=main"])
  return root
}

test("Web build inputs stay inside the future Web root", () => {
  assert.equal(fs.existsSync(path.join(frontRoot, "legal/policies")), true)
  assert.equal(fs.existsSync(path.join(frontRoot, "legal/schemas/legal-policy.schema.json")), true)
  assert.equal(fs.existsSync(path.join(frontRoot, "quality/performance/runtime-guard-baseline.json")), true)
  assert.doesNotMatch(policySource, /\.\.[/\\](legal|back|deploy|infra|perf)/)
  assert.doesNotMatch(runtimeGuardSource, /\.\.[/\\](legal|back|deploy|infra|perf)/)
  assert.doesNotMatch(legalPolicyE2eSource, /process\.cwd\(\),\s*"\.\.",\s*"legal"/)
})

test("Web boundary scanning checks and reads the same file descriptor", () => {
  assert.match(boundarySource, /openSync\(absolute/)
  assert.match(boundarySource, /fstatSync\(descriptor\)/)
  assert.match(boundarySource, /readFileSync\(descriptor\)/)
  assert.doesNotMatch(boundarySource, /statSync\(absolute\)/)
})

test("Web boundary scanner checks symlink text without blocking on a raced FIFO", (t) => {
  const symlinkRoot = createBoundaryFixture()
  t.after(() => fs.rmSync(symlinkRoot, { force: true, recursive: true }))
  fs.symlinkSync(["..", "back", "secret"].join("/"), path.join(symlinkRoot, "src/external-link"))
  git(symlinkRoot, ["add", ".githooks", "scripts", "src/external-link"])
  const symlinkResult = spawnSync(process.execPath, ["scripts/repo-boundary/check-web-boundary.mjs"], {
    cwd: symlinkRoot,
    encoding: "utf8",
  })
  assert.equal(symlinkResult.status, 1)
  assert.match(symlinkResult.stderr, /\[web-boundary\] violation: src\/external-link/)

  const raceRoot = createBoundaryFixture()
  t.after(() => fs.rmSync(raceRoot, { force: true, recursive: true }))
  fs.writeFileSync(path.join(raceRoot, "src/race.txt"), "safe\n")
  const blockedPipe = path.join(raceRoot, "blocked-pipe")
  assert.equal(spawnSync("mkfifo", [blockedPipe]).status, 0)
  const racePreload = path.join(raceRoot, "race-preload.cjs")
  fs.writeFileSync(racePreload, `
const fs = require("node:fs")
const { syncBuiltinESMExports } = require("node:module")
const originalOpenSync = fs.openSync
fs.openSync = (target, ...args) => {
  if (String(target).endsWith("/src/race.txt")) fs.renameSync(${JSON.stringify(blockedPipe)}, target)
  return originalOpenSync(target, ...args)
}
syncBuiltinESMExports()
`)
  git(raceRoot, ["add", ".githooks", "scripts", "src/race.txt"])
  const raceResult = spawnSync(
    process.execPath,
    ["--require", racePreload, "scripts/repo-boundary/check-web-boundary.mjs"],
    { cwd: raceRoot, encoding: "utf8", timeout: 1_000 },
  )
  assert.equal(raceResult.status, 0, raceResult.error?.message || raceResult.stderr)
})

test("Web CI fetches history before build-time diff guards run", () => {
  const workflows = [
    [".github/workflows/ci.yml", ["lint-build-contract-unit", "storybook-bundle", "playwright-smoke", "accessibility"]],
    [".github/workflows/security.yml", ["codeql-javascript-typescript", "browser-csp"]],
  ]

  for (const [file, jobNames] of workflows) {
    const workflow = loadYaml(fs.readFileSync(path.join(frontRoot, file), "utf8"))
    for (const jobName of jobNames) {
      const checkout = workflow.jobs[jobName].steps.find((step) => step.uses?.startsWith("actions/checkout@"))
      assert.equal(checkout.with["fetch-depth"], 0, `${file}:${jobName}`)
    }
  }
})

test("Web Security verifies scanner release assets before execution", () => {
  const workflow = loadYaml(fs.readFileSync(path.join(frontRoot, ".github/workflows/security.yml"), "utf8"))
  const steps = workflow.jobs["lockfile-audit"].steps
  const osvInstall = steps.find((step) => step.name === "Install OSV Scanner")
  const trivyInstall = steps.find((step) => step.name === "Install Trivy")

  assert.equal(osvInstall.env.OSV_SCANNER_SHA256, "15314940c10d26af9c6649f150b8a47c1262e8fc7e17b1d1029b0e479e8ed8a0")
  assert.match(osvInstall.run, /"\$\{OSV_SCANNER_SHA256\}" \/tmp\/osv-scanner \| sha256sum --check -/)
  assert.ok(osvInstall.run.indexOf("sha256sum --check") < osvInstall.run.indexOf("chmod +x"))
  assert.equal(trivyInstall.env.TRIVY_SHA256, "bbb64b9695866ce4a7a8f5c9592002c5961cab378577fa3f8a040df362b9b2ea")
  assert.match(trivyInstall.run, /"\$\{TRIVY_SHA256\}" \/tmp\/trivy\.tgz \| sha256sum --check -/)
  assert.ok(trivyInstall.run.indexOf("sha256sum --check") < trivyInstall.run.indexOf("tar -xzf"))
})

test("Web CI keeps the Storybook bundle gate strict", () => {
  const workflow = loadYaml(fs.readFileSync(path.join(frontRoot, ".github/workflows/ci.yml"), "utf8"))
  const storybookStep = workflow.jobs["storybook-bundle"].steps.find((step) => step.run === "yarn storybook:gate")

  assert.equal(storybookStep.env.STORYBOOK_GATE_ENFORCEMENT, "strict")
})

test("Web CI runs repository extraction contract tests", () => {
  const workflow = fs.readFileSync(path.join(frontRoot, ".github/workflows/ci.yml"), "utf8")

  assert.match(workflow, /node --test scripts\/live\/live-spec-contract\.test\.mjs/)
  assert.match(workflow, /node --test scripts\/repo-boundary\/web-build-inputs\.test\.mjs/)
})

test("Web pre-commit boundary scanning reads the staged index", (t) => {
  const source = fs.readFileSync(path.join(frontRoot, ".githooks/pre-commit"), "utf8")
  assert.match(source, /commit_index_file="\$\{GIT_INDEX_FILE-\}"/)
  assert.ok(source.indexOf("export GIT_INDEX_FILE") > source.indexOf("unset $(git rev-parse --local-env-vars)"))

  for (const separator of ["/", "\\"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-boundary-staged-"))
    t.after(() => fs.rmSync(root, { force: true, recursive: true }))
    git(root, ["init", "--initial-branch=main"])
    git(root, ["config", "user.email", "test@example.com"])
    git(root, ["config", "user.name", "Test"])
    fs.mkdirSync(path.join(root, ".githooks"), { recursive: true })
    fs.mkdirSync(path.join(root, "scripts/repo-boundary"), { recursive: true })
    fs.mkdirSync(path.join(root, "src"), { recursive: true })
    fs.copyFileSync(path.join(frontRoot, ".githooks/pre-commit"), path.join(root, ".githooks/pre-commit"))
    fs.copyFileSync(path.join(frontRoot, "scripts/repo-boundary/check-web-boundary.mjs"), path.join(root, "scripts/repo-boundary/check-web-boundary.mjs"))
    fs.writeFileSync(path.join(root, "src/page.ts"), "export {}\n")
    git(root, ["add", "."])
    git(root, ["commit", "-m", "initial"])

    const alternateIndex = path.join(root, "alternate.index")
    const alternateIndexEnv = { ...process.env, GIT_INDEX_FILE: alternateIndex }
    execFileSync("git", ["read-tree", "HEAD"], { cwd: root, env: alternateIndexEnv })
    fs.writeFileSync(path.join(root, "src/page.ts"), `import "${["..", "back", "secret"].join(separator)}"\n`)
    execFileSync("git", ["add", "src/page.ts"], { cwd: root, env: alternateIndexEnv })
    fs.writeFileSync(path.join(root, "src/page.ts"), "export {}\n")

    const result = spawnSync("bash", [".githooks/pre-commit"], { cwd: root, encoding: "utf8", env: alternateIndexEnv })
    assert.equal(result.status, 1, `separator=${separator}`)
    assert.match(result.stderr, /src\/page\.ts/)
  }
})

test("Web pre-commit runs from monorepo and extracted roots", (t) => {
  for (const webPrefix of ["front", ""]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-hook-root-"))
    t.after(() => fs.rmSync(root, { force: true, recursive: true }))
    git(root, ["init", "--initial-branch=main"])
    git(root, ["config", "user.email", "test@example.com"])
    git(root, ["config", "user.name", "Test"])
    const webPath = (...parts) => path.join(root, webPrefix, ...parts)

    for (const directory of [
      ".githooks",
      "scripts/repo-boundary",
      "contracts/platform",
      "legal/policies",
    ]) {
      fs.mkdirSync(webPath(directory), { recursive: true })
    }
    fs.mkdirSync(path.join(root, "bin"), { recursive: true })
    fs.copyFileSync(path.join(frontRoot, ".githooks/pre-commit"), webPath(".githooks/pre-commit"))
    fs.copyFileSync(
      path.join(frontRoot, "scripts/repo-boundary/check-web-boundary.mjs"),
      webPath("scripts/repo-boundary/check-web-boundary.mjs"),
    )
    fs.writeFileSync(webPath("contracts/platform/openapi.json"), "{}\n")
    fs.writeFileSync(webPath("legal/policies/privacy.yaml"), "version: initial\n")
    fs.writeFileSync(
      path.join(root, "bin/yarn"),
      '#!/usr/bin/env bash\nprintf "%s:%s\\n" "$PWD" "$*" >> "$YARN_LOG"\n',
    )
    fs.chmodSync(path.join(root, "bin/yarn"), 0o755)
    git(root, ["add", "."])
    git(root, ["commit", "-m", "initial"])

    fs.writeFileSync(webPath("contracts/platform/openapi.json"), '{"openapi":"3.1.0"}\n')
    fs.writeFileSync(webPath("legal/policies/privacy.yaml"), "version: changed\n")
    git(root, ["add", path.join(webPrefix, "contracts/platform/openapi.json"), path.join(webPrefix, "legal/policies/privacy.yaml")])

    const yarnLog = path.join(root, "yarn.log")
    const result = spawnSync("bash", [path.join(webPrefix, ".githooks/pre-commit")], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${path.join(root, "bin")}:${process.env.PATH}`, YARN_LOG: yarnLog },
    })
    assert.equal(result.status, 0, `${webPrefix || "extracted"}: ${result.stderr}`)
    const resolvedWebRoot = fs.realpathSync(webPath())
    assert.equal(
      fs.readFileSync(yarnLog, "utf8"),
      `${resolvedWebRoot}:contracts:check\n${resolvedWebRoot}:legal:check\n`,
      webPrefix || "extracted",
    )
  }
})

test("Web commit-msg hook honors Git's comment character", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-commit-msg-"))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  git(root, ["init", "--initial-branch=main"])
  fs.mkdirSync(path.join(root, ".githooks"), { recursive: true })
  fs.copyFileSync(path.join(frontRoot, ".githooks/commit-msg"), path.join(root, ".githooks/commit-msg"))
  const message = path.join(root, "COMMIT_EDITMSG")

  for (const [commentChar, comment] of [[null, "# default comment"], [";", "; custom comment"]]) {
    if (commentChar) git(root, ["config", "core.commentChar", commentChar])
    fs.writeFileSync(message, `${comment}\nfix(hooks): Web 커밋 message 검증\n`)
    const result = spawnSync("bash", [".githooks/commit-msg", message], { cwd: root, encoding: "utf8" })
    assert.equal(result.status, 0, `${commentChar || "default"}: ${result.stderr}`)
  }

  git(root, ["config", "core.commentChar", "auto"])
  fs.writeFileSync(message, "# 실제 subject\nfix(hooks): Web 커밋 message 검증\n")
  const autoResult = spawnSync("bash", [".githooks/commit-msg", message], { cwd: root, encoding: "utf8" })
  assert.equal(autoResult.status, 1, "auto must not discard a real subject starting with #")
  assert.match(autoResult.stderr, /core\.commentString\/core\.commentChar=auto/)
})
