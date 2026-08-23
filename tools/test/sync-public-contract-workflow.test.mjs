import assert from "node:assert/strict"
import crypto from "node:crypto"
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const root = path.resolve(import.meta.dirname, "../..")
const workflowPath = path.join(root, ".github/workflows/sync-public-contract-to-web.yml")
const payloadKeys = [
  "schema_version",
  "source_repository",
  "source_commit",
  "manifest_sha256",
  "openapi_sha256",
  "error_codes_sha256",
  "target_repository",
  "target_commit",
  "delivery_id",
]

function workflow() {
  assert.equal(existsSync(workflowPath), true, "public-contract producer workflow must exist")
  const source = readFileSync(workflowPath, "utf8")
  const ruby = ["require 'yaml'", "require 'json'", "puts JSON.generate(YAML.load_file(ARGV.fetch(0)))"].join("; ")
  const parsed = spawnSync("ruby", ["-e", ruby, workflowPath], { encoding: "utf8" })
  assert.equal(parsed.status, 0, parsed.stderr || "workflow YAML must parse")
  return { source, document: JSON.parse(parsed.stdout) }
}

function producerJob(document) {
  const jobs = Object.values(document.jobs).filter((job) =>
    job.steps?.some((candidate) => String(candidate.run ?? "").includes("/dispatches")),
  )
  assert.equal(jobs.length, 1, "exactly one job may dispatch the public contract")
  return jobs[0]
}

function matchingStep(job, predicate, description) {
  const matches = job.steps.filter(predicate)
  assert.equal(matches.length, 1, `expected one ${description} step`)
  return matches[0]
}

function runShell(source, cwd, env = {}) {
  return spawnSync("bash", ["-c", source], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  })
}

function output(pathname) {
  return existsSync(pathname) ? readFileSync(pathname, "utf8") : ""
}

function values(pathname) {
  return Object.fromEntries(output(pathname).trim().split("\n").filter(Boolean).map((line) => {
    const separator = line.indexOf("=")
    return [line.slice(0, separator), line.slice(separator + 1)]
  }))
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex")
}

function fakeGh(temp, response) {
  const bin = path.join(temp, "bin")
  const calls = path.join(temp, "gh-calls")
  mkdirSync(bin, { recursive: true })
  const executable = path.join(bin, "gh")
  writeFileSync(executable, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${calls}"\nprintf '%s\\n' "${response}"\n`)
  chmodSync(executable, 0o755)
  return { calls, path: `${bin}:${process.env.PATH}` }
}

function writeContractBundle(platform) {
  const directory = path.join(platform, "contracts/public-api")
  mkdirSync(directory, { recursive: true })
  const openapi = Buffer.from('{"openapi":"3.1.0"}\n')
  const errorCodes = Buffer.from('[{"code":"400-1"}]\n')
  const summaryFixtures = Buffer.from('{"version":1,"contract":"aquila-canonical-summary-fixtures","fixtures":[]}\n')
  writeFileSync(path.join(directory, "openapi.json"), openapi)
  writeFileSync(path.join(directory, "error-codes.json"), errorCodes)
  writeFileSync(path.join(directory, "summary-fixtures.json"), summaryFixtures)
  const manifest = Buffer.from(`${JSON.stringify({
    version: 1,
    contract: "aquila-public-api",
    artifacts: {
      openapi: { path: "openapi.json", sha256: sha256(openapi) },
      errorCodes: { path: "error-codes.json", sha256: sha256(errorCodes) },
      summaryFixtures: { path: "summary-fixtures.json", sha256: sha256(summaryFixtures) },
    },
  }, null, 2)}\n`)
  writeFileSync(path.join(directory, "manifest.json"), manifest)
  return { errorCodes, manifest, openapi, summaryFixtures }
}

test("every main push reconciles delivery while manual runs only validate", (t) => {
  const { document } = workflow()
  const triggers = document.on ?? document.true
  const job = producerJob(document)
  const context = matchingStep(job, (candidate) => String(candidate.run ?? "").includes("dispatch_enabled="), "producer context")

  assert.deepEqual(triggers.push, { branches: ["main"] })
  assert.equal(Object.hasOwn(triggers.push, "paths"), false, "every main push must produce a replacement delivery run")
  assert.deepEqual(Object.keys(triggers.workflow_dispatch.inputs), ["source_ref"])
  assert.equal(triggers.workflow_dispatch.inputs.source_ref.default, "main")
  assert.deepEqual(document.permissions, { contents: "read" })
  assert.deepEqual(document.concurrency, { group: "platform-public-contract-sync", "cancel-in-progress": false })
  assert.match(String(job.if), /workflow_dispatch/)
  assert.match(String(job.if), /REPO_SPLIT_SYNC_ENABLED/)

  const temp = mkdtempSync(path.join(os.tmpdir(), "platform-public-context-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const manualOutput = path.join(temp, "manual.out")
  const manual = runShell(context.run, temp, {
    EVENT_NAME: "workflow_dispatch",
    EVENT_SHA: "a".repeat(40),
    REQUESTED_SOURCE_REF: "refs/pull/1683/head",
    SYNC_ENABLED: "true",
    GITHUB_OUTPUT: manualOutput,
  })
  assert.equal(manual.status, 0, manual.stderr)
  assert.deepEqual(values(manualOutput), { source_ref: "refs/pull/1683/head", dispatch_enabled: "false" })

  const pushOutput = path.join(temp, "push.out")
  const push = runShell(context.run, temp, {
    EVENT_NAME: "push",
    EVENT_SHA: "b".repeat(40),
    REQUESTED_SOURCE_REF: "",
    SYNC_ENABLED: "true",
    GITHUB_OUTPUT: pushOutput,
  })
  assert.equal(push.status, 0, push.stderr)
  assert.deepEqual(values(pushOutput), { source_ref: "b".repeat(40), dispatch_enabled: "true" })
})

test("Platform source and exact three canonical public artifacts fail closed with raw hashes", (t) => {
  const { document } = workflow()
  const job = producerJob(document)
  const sourceStep = matchingStep(job, (candidate) => String(candidate.run ?? "").includes("git -C platform rev-parse HEAD"), "source identity")
  const identityStep = matchingStep(job, (candidate) => {
    const run = String(candidate.run ?? "")
    return run.includes("summary-fixtures.json") && run.includes("manifest_sha256=") && run.includes("openapi_sha256=") && run.includes("error_codes_sha256=")
  }, "public contract identity")
  const temp = mkdtempSync(path.join(os.tmpdir(), "platform-public-source-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const platform = path.join(temp, "platform")
  mkdirSync(platform)
  assert.equal(runShell("git init -q && git config user.email test@example.com && git config user.name test && git commit --allow-empty -qm source", platform).status, 0)
  const sourceCommit = runShell("git rev-parse HEAD", platform).stdout.trim()

  const manualOutput = path.join(temp, "source-manual.out")
  const manual = runShell(sourceStep.run, temp, {
    DISPATCH_ENABLED: "false",
    EVENT_SHA: "f".repeat(40),
    SOURCE_REF: "refs/pull/1683/head",
    GITHUB_OUTPUT: manualOutput,
  })
  assert.equal(manual.status, 0, manual.stderr)
  assert.equal(values(manualOutput).source_commit, sourceCommit)

  const mismatchedPush = runShell(sourceStep.run, temp, {
    DISPATCH_ENABLED: "true",
    EVENT_SHA: "f".repeat(40),
    SOURCE_REF: "f".repeat(40),
    GITHUB_OUTPUT: path.join(temp, "source-push.out"),
  })
  assert.notEqual(mismatchedPush.status, 0, "automatic delivery must use the exact push commit")

  const bundle = writeContractBundle(platform)
  const identityOutput = path.join(temp, "identity.out")
  const identity = runShell(identityStep.run, platform, { GITHUB_OUTPUT: identityOutput })
  assert.equal(identity.status, 0, identity.stderr)
  assert.deepEqual(values(identityOutput), {
    manifest_sha256: sha256(bundle.manifest),
    openapi_sha256: sha256(bundle.openapi),
    error_codes_sha256: sha256(bundle.errorCodes),
  })

  writeFileSync(path.join(platform, "contracts/public-api/openapi.json"), `${bundle.openapi} `)
  const rejected = runShell(identityStep.run, platform, { GITHUB_OUTPUT: path.join(temp, "rejected.out") })
  assert.notEqual(rejected.status, 0, "artifact bytes that disagree with the manifest must fail closed")

  writeFileSync(path.join(platform, "contracts/public-api/openapi.json"), bundle.openapi)
  writeFileSync(path.join(platform, "contracts/public-api/summary-fixtures.json"), `${bundle.summaryFixtures} `)
  const rejectedSummaryFixtures = runShell(identityStep.run, platform, { GITHUB_OUTPUT: path.join(temp, "rejected-summary-fixtures.out") })
  assert.notEqual(rejectedSummaryFixtures.status, 0, "summary-fixture bytes that disagree with the manifest must fail closed")
})

test("stale Platform main is a successful no-op before the scoped Web token", (t) => {
  const { document } = workflow()
  const job = producerJob(document)
  const freshness = matchingStep(job, (candidate) => {
    const run = String(candidate.run ?? "")
    return run.includes("commits/main") && run.includes("should_dispatch=")
  }, "Platform main freshness")
  const token = matchingStep(job, (candidate) => String(candidate.uses ?? "").startsWith("actions/create-github-app-token@"), "Web dispatch token")
  const temp = mkdtempSync(path.join(os.tmpdir(), "platform-public-freshness-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const current = "a".repeat(40)
  const gh = fakeGh(temp, current)

  const freshOutput = path.join(temp, "fresh.out")
  const fresh = runShell(freshness.run, temp, {
    PATH: gh.path,
    SOURCE_COMMIT: current,
    SOURCE_REPOSITORY: "AquilaXk/aquila-blog",
    GITHUB_OUTPUT: freshOutput,
    GITHUB_STEP_SUMMARY: path.join(temp, "fresh.summary"),
  })
  assert.equal(fresh.status, 0, fresh.stderr)
  assert.equal(values(freshOutput).should_dispatch, "true")

  const staleOutput = path.join(temp, "stale.out")
  const stale = runShell(freshness.run, temp, {
    PATH: gh.path,
    SOURCE_COMMIT: "b".repeat(40),
    SOURCE_REPOSITORY: "AquilaXk/aquila-blog",
    GITHUB_OUTPUT: staleOutput,
    GITHUB_STEP_SUMMARY: path.join(temp, "stale.summary"),
  })
  assert.equal(stale.status, 0, stale.stderr)
  assert.equal(values(staleOutput).should_dispatch, "false")

  assert.equal(token.with.repositories.trim(), "aquila-blog-web")
  assert.equal(token.with["permission-contents"], "write")
  assert.equal(token.with["permission-pull-requests"], undefined)
  assert.match(String(token.if), /should_dispatch == 'true'/)
  assert.ok(job.steps.indexOf(freshness) < job.steps.indexOf(token))
})

test("delivery uses the frozen nine-key payload and raw-value delivery hash", (t) => {
  const { document } = workflow()
  const job = producerJob(document)
  const prepare = matchingStep(job, (candidate) => {
    const run = String(candidate.run ?? "")
    return run.includes("commits/main") && run.includes("delivery_id=")
  }, "delivery preparation")
  const dispatch = matchingStep(job, (candidate) => String(candidate.run ?? "").includes("/dispatches"), "repository dispatch")
  const temp = mkdtempSync(path.join(os.tmpdir(), "platform-public-delivery-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const targetCommit = "e".repeat(40)
  const fixture = {
    SCHEMA_VERSION: "1",
    SOURCE_REPOSITORY: "AquilaXk/aquila-blog",
    SOURCE_COMMIT: "a".repeat(40),
    MANIFEST_SHA256: "b".repeat(64),
    OPENAPI_SHA256: "c".repeat(64),
    ERROR_CODES_SHA256: "d".repeat(64),
    TARGET_REPOSITORY: "AquilaXk/aquila-blog-web",
  }
  const gh = fakeGh(temp, targetCommit)
  const preparedOutput = path.join(temp, "prepared.out")
  const prepared = runShell(prepare.run, temp, {
    ...fixture,
    PATH: gh.path,
    GITHUB_OUTPUT: preparedOutput,
  })
  assert.equal(prepared.status, 0, prepared.stderr)
  const expectedDeliveryId = sha256(Buffer.from([
    fixture.SCHEMA_VERSION,
    fixture.SOURCE_REPOSITORY,
    fixture.SOURCE_COMMIT,
    fixture.MANIFEST_SHA256,
    fixture.OPENAPI_SHA256,
    fixture.ERROR_CODES_SHA256,
    fixture.TARGET_REPOSITORY,
    targetCommit,
    "",
  ].join("\n")))
  assert.deepEqual(values(preparedOutput), { target_commit: targetCommit, delivery_id: expectedDeliveryId })

  const malformedRoot = mkdtempSync(path.join(os.tmpdir(), "platform-public-bad-target-"))
  t.after(() => rmSync(malformedRoot, { recursive: true, force: true }))
  const malformedGh = fakeGh(malformedRoot, "not-a-commit")
  const malformed = runShell(prepare.run, temp, {
    ...fixture,
    PATH: malformedGh.path,
    GITHUB_OUTPUT: path.join(temp, "malformed.out"),
  })
  assert.notEqual(malformed.status, 0, "invalid Web main identity must fail closed")

  const fields = [...dispatch.run.matchAll(/client_payload\[([^\]]+)\]/g)].map((match) => match[1])
  assert.deepEqual(fields, payloadKeys)
  assert.match(dispatch.run, /event_type="platform_public_contract_ready"/)
  assert.equal((dispatch.run.match(/gh api --method POST/g) ?? []).length, 1)
})

test("producer has one dispatch mutation and no foreign Web write path", () => {
  const { document, source } = workflow()
  const job = producerJob(document)
  const checkouts = job.steps.filter((candidate) => String(candidate.uses ?? "").startsWith("actions/checkout@"))

  assert.equal(checkouts.length, 1)
  assert.equal(checkouts[0].with?.repository, undefined)
  assert.equal(checkouts[0].with?.["persist-credentials"], false)
  assert.equal((source.match(/gh api --method POST/g) ?? []).length, 1)
  assert.doesNotMatch(source, /SYNC_BRANCH|working-directory:\s*web|path:\s*web|repository:\s*AquilaXk\/aquila-blog-web|cache-dependency-path:\s*web|\byarn\b|import-platform-contracts|contracts:generate|git -C web|gh auth setup-git|git push|gh pr (?:list|create|edit|close)|permission-pull-requests/)
})
