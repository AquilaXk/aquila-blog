import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const workflowPath = path.join(repoRoot, ".github/workflows/sync-web-legal-policy-to-platform.yml")
const payloadKeys = ["schema_version", "source_repository", "source_commit", "manifest_sha256", "target_repository", "target_commit", "delivery_id"]

function workflow() {
  assert.equal(existsSync(workflowPath), true, "Platform-local Web legal-policy receiver must exist")
  const source = readFileSync(workflowPath, "utf8")
  const ruby = ["require 'yaml'", "require 'json'", "puts JSON.generate(YAML.load_file(ARGV.fetch(0)))"].join("; ")
  const parsed = spawnSync("ruby", ["-e", ruby, workflowPath], { encoding: "utf8" })
  assert.equal(parsed.status, 0, parsed.stderr || "workflow YAML must parse")
  return { document: JSON.parse(parsed.stdout), source }
}

function stepByName(job, name) {
  const step = job.steps.find((candidate) => candidate.name === name)
  assert.ok(step, `missing workflow step: ${name}`)
  return step
}

test("receiver accepts only the exact seven-key Web legal-policy dispatch contract", () => {
  const { document, source } = workflow()
  assert.deepEqual(document.on.repository_dispatch.types, ["web_legal_policy_ready"])
  assert.deepEqual(document.permissions, { contents: "read", "pull-requests": "read" })
  assert.deepEqual(document.concurrency, { group: "web-legal-policy-sync", "cancel-in-progress": false })

  const admission = stepByName(document.jobs.receive, "Admit Web legal-policy dispatch")
  assert.equal(admission.env.LEGAL_POLICY_DISPATCH_SENDER, "${{ github.event.sender.login || '' }}")
  for (const key of payloadKeys) {
    assert.match(admission.run, new RegExp(`LEGAL_POLICY_${key.toUpperCase()}=`))
  }
  assert.match(admission.run, /exactly seven payload keys/)
  assert.match(admission.run, /client_payload.*keys_unsorted|keys_unsorted.*client_payload/s)
  assert.match(admission.run, /schema_version[\s\S]*source_repository[\s\S]*source_commit[\s\S]*manifest_sha256[\s\S]*target_repository[\s\S]*target_commit[\s\S]*delivery_id/)
  assert.match(admission.run, /REPO_SYNC_APP_BOT_LOGIN/)
  assert.match(admission.run, /AquilaXk\/aquila-blog-web/)
  assert.match(admission.run, /\^\[0-9a-f\]\{40\}\$/)
  assert.match(admission.run, /\^\[0-9a-f\]\{64\}\$/)
  assert.match(admission.run, /delivery id mismatch/)
  assert.match(admission.run, /printf '%s\\n'\s*\\[\s\S]*?"\$\{LEGAL_POLICY_SCHEMA_VERSION\}"\s*\\[\s\S]*?"\$\{LEGAL_POLICY_SOURCE_REPOSITORY\}"\s*\\[\s\S]*?"\$\{LEGAL_POLICY_SOURCE_COMMIT\}"\s*\\[\s\S]*?"\$\{LEGAL_POLICY_MANIFEST_SHA256\}"\s*\\[\s\S]*?"\$\{LEGAL_POLICY_TARGET_REPOSITORY\}"\s*\\[\s\S]*?"\$\{LEGAL_POLICY_TARGET_COMMIT\}"/)
})

test("admission makes stale source or target a write-free success no-op", () => {
  const { document } = workflow()
  const job = document.jobs.receive
  const admission = stepByName(job, "Admit Web legal-policy dispatch")
  assert.match(admission.run, /repos\/\$\{LEGAL_POLICY_SOURCE_REPOSITORY\}\/commits\/main/)
  assert.match(admission.run, /repos\/\$\{GITHUB_REPOSITORY\}\/commits\/main/)
  assert.match(admission.run, /stale-web-source/)
  assert.match(admission.run, /stale-platform-target/)
  assert.match(admission.run, /result=\$\{ADMISSION_RESULT\}/)
  assert.match(String(job.if || ""), /repository_dispatch/)
  for (const downstream of Object.values(document.jobs)) {
    if (downstream !== job) assert.match(String(downstream.if || ""), /dispatch_admission == 'proceed'/)
  }
})

test("receiver reads one exact Web manifest without checking out, building, or writing Web", () => {
  const { document, source } = workflow()
  const job = document.jobs.receive
  const fetch = stepByName(job, "Fetch exact Web legal-policy manifest")
  assert.match(fetch.run, /repos\/\$\{LEGAL_POLICY_SOURCE_REPOSITORY\}\/contents\/contracts\/export\/legal-policy-manifest\.json\?ref=\$\{LEGAL_POLICY_SOURCE_COMMIT\}/)
  assert.match(fetch.run, /base64/)
  assert.match(fetch.run, /sha256sum/)
  assert.doesNotMatch(source, /actions\/checkout/)
  assert.doesNotMatch(source, /repository:\s*AquilaXk\/aquila-blog-web/)
  assert.doesNotMatch(source, /\byarn\b|\bnpm\b|\bpnpm\b|codegen|git -C .*web|git clone/)
  assert.doesNotMatch(source, /gh api .*aquila-blog-web.*(?:-X POST|-X PUT|-f |--method (?:POST|PUT))/)
})

test("write path uses separate least-privilege tokens and one Platform-local draft PR", () => {
  const { document, source } = workflow()
  const job = document.jobs.receive
  const readToken = stepByName(job, "Create Web read token")
  const writeToken = stepByName(job, "Create Platform write token")
  assert.equal(readToken.with.repositories, "aquila-blog-web\n")
  assert.equal(readToken.with["permission-contents"], "read")
  assert.equal(writeToken.with.repositories, "aquila-blog\n")
  assert.equal(writeToken.with["permission-contents"], "write")
  assert.equal(writeToken.with["permission-pull-requests"], "write")
  assert.match(String(writeToken.if), /changed == 'true'/)
  assert.match(String(writeToken.if), /dispatch_admission == 'proceed'/)
  assert.match(source, /SYNC_BRANCH:\s*chore\/web-legal-policy-sync/)
  const branch = stepByName(job, "Prepare stable Platform sync branch against latest main")
  assert.match(branch.run, /merge --no-edit origin\/main/)
  assert.doesNotMatch(branch.run, /--force(?:-with-lease)?/)
  const pullRequest = stepByName(job, "Create or update the single Platform legal-policy PR")
  assert.match(pullRequest.run, /gh pr list/)
  assert.match(pullRequest.run, /gh pr create/)
  assert.match(pullRequest.run, /--draft/)
  assert.match(pullRequest.run, /Refs #1683/)
})

test("provenance drift and replay cannot silently write", () => {
  const { document } = workflow()
  const job = document.jobs.receive
  const verify = stepByName(job, "Recheck exact current identity before writing")
  assert.match(verify.run, /stale-web-source/)
  assert.match(verify.run, /stale-platform-target/)
  const changes = stepByName(job, "Detect canonical provenance-only lock drift")
  assert.match(changes.run, /sourceRepository|sourceCommit|manifestSha256/)
  const noChange = stepByName(job, "Assert replay does not create a write token")
  assert.match(noChange.run, /write token|commit|push|pull request/i)
  assert.match(String(noChange.if), /changed != 'true'/)
})

test("stable branch enforces a committed-range allowlist and rechecks freshness immediately before push", () => {
  const { document } = workflow()
  const job = document.jobs.receive
  const branch = stepByName(job, "Prepare stable Platform sync branch against latest main")
  const commit = stepByName(job, "Commit canonical Web legal-policy identity")
  const freshness = stepByName(job, "Recheck exact current identity before writing")
  const push = stepByName(job, "Push stable Platform legal-policy branch")
  const names = job.steps.map((step) => step.name)

  assert.match(branch.run, /origin\/main\.\.\.HEAD/)
  assert.match(branch.run, /contracts\/web\/legal-policy-manifest\.lock\.json/)
  assert.match(branch.run, /unexpected committed Platform branch diff/)
  assert.ok(names.indexOf(freshness.name) > names.indexOf(commit.name))
  assert.ok(names.indexOf(push.name) > names.indexOf(freshness.name))
  assert.match(String(push.if), /freshness\.outputs\.dispatch_admission == 'proceed'/)
})

test("an exact stable branch can recreate a missing Draft PR without another commit or push", () => {
  const { document } = workflow()
  const job = document.jobs.receive
  const branch = stepByName(job, "Prepare stable Platform sync branch against latest main")
  const pullRequest = stepByName(job, "Create or update the single Platform legal-policy PR")

  assert.match(branch.run, /ready=true/)
  assert.match(String(pullRequest.if), /branch\.outputs\.ready == 'true'/)
  assert.match(String(pullRequest.if), /branch\.outputs\.changed != 'true'/)
  assert.match(String(pullRequest.if), /push\.outputs\.pushed == 'true'/)
})
