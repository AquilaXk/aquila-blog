import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const workflowPath = path.join(repoRoot, ".github/workflows/sync-public-contract-to-web.yml")

function parseWorkflow() {
  const ruby = [
    'require "yaml"',
    'require "json"',
    'puts JSON.generate(YAML.load_file(ARGV.fetch(0)))',
  ].join("; ")
  const result = spawnSync("ruby", ["-e", ruby, workflowPath], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr || "workflow YAML must parse")
  return JSON.parse(result.stdout)
}

function workflow() {
  assert.equal(existsSync(workflowPath), true, "sync workflow must exist")
  const source = readFileSync(workflowPath, "utf8")
  return { document: parseWorkflow(), source }
}

function stepByName(job, name) {
  const step = job.steps.find((candidate) => candidate.name === name)
  assert.ok(step, `missing workflow step: ${name}`)
  return step
}

test("sync workflow has the stable trigger and serialized branch contract", () => {
  const { document, source } = workflow()

  assert.match(source, /^  push:\n    branches:\n      - main\n    paths:\n      - "contracts\/public-api\/\*\*"/m)
  assert.match(source, /^  workflow_dispatch:\n    inputs:\n      source_ref:/m)
  assert.match(source, /^      mode:\n[\s\S]*?options:\n          - test-only\n          - sync/m)
  assert.deepEqual(document.concurrency, {
    group: "platform-public-contract-sync",
    "cancel-in-progress": false,
  })
  assert.deepEqual(document.permissions, {
    contents: "read",
    "pull-requests": "read",
  })
  assert.equal(document.env.SYNC_BRANCH, "chore/platform-contract-sync")
  assert.equal(document.env.PLATFORM_REPOSITORY, "AquilaXk/aquila-blog")
  assert.equal(document.env.WEB_REPOSITORY, "AquilaXk/aquila-blog-web")
})

test("test-only path checks out, imports, generates, and tests without write credentials", () => {
  const { document, source } = workflow()
  const job = document.jobs.sync
  assert.deepEqual(job.permissions, { contents: "read", "pull-requests": "read" })

  const platformCheckout = stepByName(job, "Checkout immutable Platform source")
  const webCheckout = stepByName(job, "Checkout Web main without persisted credentials")
  for (const checkout of [platformCheckout, webCheckout]) {
    assert.match(checkout.uses, /^actions\/checkout@[a-f0-9]{40}$/)
    assert.equal(checkout.with["persist-credentials"], false)
  }
  assert.equal(webCheckout.with.repository, "AquilaXk/aquila-blog-web")
  assert.equal(webCheckout.with.ref, "main")

  const sourceStep = stepByName(job, "Resolve immutable Platform commit")
  assert.equal(sourceStep.env.SOURCE_REF, "${{ steps.context.outputs.source_ref }}")
  assert.doesNotMatch(sourceStep.run, /\$\{\{\s*steps\.context\.outputs\.source_ref/)

  const importStep = stepByName(job, "Import immutable Platform contract")
  assert.match(importStep.run, /import-platform-contracts\.mjs/)
  assert.match(importStep.run, /--source \.\.\/platform\/contracts\/public-api/)
  assert.match(importStep.run, /--source-repository "\$\{PLATFORM_REPOSITORY\}"/)
  assert.match(importStep.run, /--source-commit "\$\{SOURCE_SHA\}"/)

  const verifyStep = stepByName(job, "Generate and verify Web contract artifacts")
  assert.match(verifyStep.run, /yarn contracts:generate/)
  assert.match(verifyStep.run, /yarn contracts:check/)

  const readOnlyStep = stepByName(job, "Assert read-only mode cannot publish")
  assert.match(String(readOnlyStep.if), /write_enabled != 'true'/)
  assert.doesNotMatch(readOnlyStep.run, /git push|gh pr (?:create|edit)/)

  for (const step of job.steps.filter((candidate) => candidate.run)) {
    assert.doesNotMatch(
      step.run,
      /\$\{\{\s*(?:inputs\.source_ref|steps\.context\.outputs\.source_ref)/,
      `${step.name} must receive workflow-dispatch input through env`,
    )
  }

  assert.match(source, /PLATFORM_CONTRACT_SYNC_ENABLED/)
  assert.match(source, /manual sync requires PLATFORM_CONTRACT_SYNC_ENABLED=true/)
})

test("sync writes require the kill switch, changed bytes, and a scoped App token", () => {
  const { document, source } = workflow()
  const job = document.jobs.sync
  const token = stepByName(job, "Create repository sync token")

  assert.equal(token.uses, "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1")
  assert.match(String(token.if), /write_enabled == 'true'/)
  assert.match(String(token.if), /changed == 'true'/)
  assert.equal(token.with["client-id"], "${{ vars.REPO_SYNC_APP_CLIENT_ID }}")
  assert.equal(token.with["private-key"], "${{ secrets.REPO_SYNC_APP_PRIVATE_KEY }}")
  assert.equal(token.with.owner, "AquilaXk")
  assert.equal(token.with.repositories, "aquila-blog\naquila-blog-web\n")
  assert.equal(token.with["permission-contents"], "write")
  assert.equal(token.with["permission-pull-requests"], "write")
  assert.doesNotMatch(source, /skip-token-revoke/)
  assert.doesNotMatch(source, /pull_request_target|PERSONAL_ACCESS_TOKEN|\bPAT\b/)

  for (const name of [
    "Resolve repository sync App identity",
    "Commit latest Platform snapshot",
    "Push stable Web sync branch",
    "Create or update the single Web compatibility PR",
  ]) {
    const step = stepByName(job, name)
    assert.match(String(step.if), /write_enabled == 'true'/)
    assert.match(String(step.if), /changed == 'true'/)
  }
})

test("publisher updates one stable branch and reuses one open PR", () => {
  const { document } = workflow()
  const job = document.jobs.sync
  const push = stepByName(job, "Push stable Web sync branch")
  const pullRequest = stepByName(job, "Create or update the single Web compatibility PR")

  assert.match(push.run, /gh auth setup-git/)
  assert.match(push.run, /git -C web push origin "HEAD:refs\/heads\/\$\{SYNC_BRANCH\}"/)
  assert.equal(push.env.GH_TOKEN, "${{ steps.app-token.outputs.token }}")

  const listIndex = pullRequest.run.indexOf("gh pr list")
  const createIndex = pullRequest.run.indexOf("gh pr create")
  const editIndex = pullRequest.run.indexOf("gh pr edit")
  assert.ok(listIndex >= 0 && createIndex > listIndex && editIndex > listIndex)
  assert.match(pullRequest.run, /--head "\$\{SYNC_BRANCH\}"/)
  assert.match(pullRequest.run, /source commit: `%s`/)
  assert.match(pullRequest.run, /source ref: `%s`/)
  assert.match(pullRequest.run, /"\$\{SOURCE_SHA\}"/)
  assert.match(pullRequest.run, /"\$\{SOURCE_REF\}"/)
  assert.equal(pullRequest.env.GH_TOKEN, "${{ steps.app-token.outputs.token }}")
})
