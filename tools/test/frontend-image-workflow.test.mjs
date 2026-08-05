import assert from "node:assert/strict"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const deployPath = path.join(repoRoot, ".github/workflows/deploy.yml")
const ciPath = path.join(repoRoot, ".github/workflows/ci.yml")
const producerPath = path.join(repoRoot, ".github/workflows/frontend-image.yml")
const securityPath = path.join(repoRoot, ".github/workflows/security.yml")

function deploy() {
  return readFileSync(deployPath, "utf8")
}

function workflowDocument(workflowPath) {
  const result = spawnSync("ruby", ["-e", 'require "yaml"; require "json"; document = YAML.load_file(ARGV[0]); document["on"] = document.delete(true) if document.key?(true); puts JSON.generate(document)', workflowPath], { encoding: "utf8" })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

function deployDocument() {
  return workflowDocument(deployPath)
}

function securityDocument() {
  return workflowDocument(securityPath)
}

function runWorkflowGate(stepName, responses) {
  const step = Object.values(deployDocument().jobs).flatMap((job) => job.steps || []).find((item) => item.name === stepName)
  assert.ok(step, `${stepName} step must exist`)
  const directory = mkdtempSync(path.join(tmpdir(), "aquila-workflow-gate-"))
  const gh = path.join(directory, "gh")
  const sleep = path.join(directory, "sleep")
  const calls = path.join(directory, "calls")
  const responseFile = path.join(directory, "responses")
  writeFileSync(calls, "")
  writeFileSync(responseFile, responses.join("\n"))
  writeFileSync(
    gh,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${calls}"\nresponse="$(head -n 1 "${responseFile}")"\ntail -n +2 "${responseFile}" > "${responseFile}.next"\nmv "${responseFile}.next" "${responseFile}"\ncase "$response" in\n  error) exit 1 ;;\n  *) printf '%s\\n' "$response" ;;\nesac\n`,
  )
  writeFileSync(sleep, `#!/usr/bin/env bash\nprintf 'sleep %s\\n' "$*" >> "${calls}"\n`)
  chmodSync(gh, 0o755)
  chmodSync(sleep, 0o755)
  const result = spawnSync("bash", ["-c", step.run], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "repository_dispatch",
      GITHUB_REPOSITORY: "AquilaXk/aquila-blog",
      DEPLOY_SHA: "a".repeat(40),
      ALLOW_DEPLOY_WITHOUT_CI_SUCCESS: "false",
      ALLOW_DEPLOY_WITHOUT_SECURITY_SUCCESS: "false",
      TRIGGER_WORKFLOW_NAME: "",
      PATH: `${directory}:${process.env.PATH}`,
    },
  })
  const callLog = readFileSync(calls, "utf8").trim().split("\n").filter(Boolean)
  rmSync(directory, { recursive: true, force: true })
  return { ...result, callLog }
}

function gateJq(stepName) {
  const step = Object.values(deployDocument().jobs).flatMap((job) => job.steps || []).find((item) => item.name === stepName)
  assert.ok(step, `${stepName} step must exist`)
  const match = step.run.match(/--jq '([\s\S]*?)'\n/)
  assert.ok(match, `${stepName} must define a jq selector`)
  return match[1]
}

const dockerSeparator = String.raw`(?:\s+|[ \t]*\\\r?\n[ \t]*)`
const dockerOption = String.raw`--?[^\s]+(?:${dockerSeparator}(?!--)[^\s]+)?`
const dockerOptions = String.raw`(?:${dockerSeparator}${dockerOption})*`
const dockerCommandStart = String.raw`(?:^|[\r\n;|]|&&|\|\|)[ \t]*(?:(?:if|then)${dockerSeparator})?(?:-[ \t]+)?(?:run:[ \t]*)?["']?(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+${dockerSeparator})*(?:sudo${dockerSeparator})?`
const dockerCommand = new RegExp(
  String.raw`${dockerCommandStart}docker${dockerOptions}${dockerSeparator}(?:(?:image${dockerOptions}${dockerSeparator})?(?:build|push)|bake|manifest${dockerOptions}${dockerSeparator}push|buildx${dockerOptions}${dockerSeparator}(?:build|bake|imagetools${dockerOptions}${dockerSeparator}create)|builder${dockerOptions}${dockerSeparator}build|compose${dockerOptions}${dockerSeparator}(?:build|push|up${dockerOptions}${dockerSeparator}--build))\b`,
  "i",
)
const buildAction = /^docker\/(?:build-push|buildx|bake)-action@/i

test("CI runs for every main push while retaining PR path filtering", () => {
  const triggers = workflowDocument(ciPath).on

  assert.equal(triggers.push.paths, undefined)
  assert.equal(triggers.push["paths-ignore"], undefined)
  assert.deepEqual(triggers.push.branches, ["main"])
  assert.deepEqual(triggers.pull_request.paths, [
    "back/**",
    "front/**",
    "contracts/public-api/**",
    "tools/contracts/**",
    "tools/test/public-contract-manifest.test.mjs",
    "tools/test/sync-public-contract-workflow.test.mjs",
    "tools/test/setup-node-pin-parity.test.mjs",
    "tools/test/frontend-image-workflow.test.mjs",
    "tools/test/dockerfile-supply-chain.test.mjs",
    "deploy/**",
    "restore-privacy-gate.sh",
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    "CURSOR.md",
    "COPILOT.md",
    "docs/**",
    "tools/guards/check-forbidden-tracked-files.sh",
    "tools/guards/check-terraform-no-world-open-sg.sh",
    "tools/ci/**",
    "tools/repo-boundary/**",
    "tools/repo-split/**",
    "tools/guards/check-public-api-caddy-drift.sh",
    "tools/guards/public-api-read-caddy-paths.sot",
    "infra/**",
    "tools/test/check-forbidden-tracked-files.test.sh",
    "tools/test/materialize-compose-test-env.test.mjs",
    "tools/test/repository-standalone-verification.test.sh",
    ".github/workflows/**",
  ])
})

test("Security queues exact-SHA runs without cancellation", () => {
  const concurrency = securityDocument().concurrency

  assert.equal(concurrency.group, "security-${{ github.workflow }}-${{ github.ref }}")
  assert.equal(concurrency.queue, "max")
  assert.equal(concurrency["cancel-in-progress"], undefined)
})

test("CI gate waits for an active matching run to succeed", () => {
  const result = runWorkflowGate("Require successful CI for workflow_dispatch or Security trigger", ["active:1", "success:1"])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.callLog.filter((call) => call.startsWith("api ")).length, 2)
  assert.deepEqual(result.callLog.filter((call) => call.startsWith("sleep ")), ["sleep 60"])
})

test("Security gate fails immediately when matching runs are terminal non-success", () => {
  const result = runWorkflowGate("Require successful Security for deploy SHA", ["terminal:2"])

  assert.notEqual(result.status, 0)
  assert.equal(result.callLog.filter((call) => call.startsWith("api ")).length, 1)
  assert.deepEqual(result.callLog.filter((call) => call.startsWith("sleep ")), [])
})

test("CI gate fails immediately when the workflow API errors", () => {
  const result = runWorkflowGate("Require successful CI for workflow_dispatch or Security trigger", ["error"])

  assert.notEqual(result.status, 0)
  assert.equal(result.callLog.filter((call) => call.startsWith("api ")).length, 1)
  assert.deepEqual(result.callLog.filter((call) => call.startsWith("sleep ")), [])
})

test("dispatch gate selectors classify every nonterminal GitHub status as active", () => {
  const input = JSON.stringify({
    workflow_runs: [
      { id: 1, event: "push", head_branch: "main", status: "completed", conclusion: "failure" },
      { id: 2, event: "push", head_branch: "main", status: "requested" },
      { id: 3, event: "push", head_branch: "main", status: "waiting" },
      { id: 4, event: "push", head_branch: "main", status: "pending" },
    ],
  })
  for (const stepName of [
    "Require successful CI for workflow_dispatch or Security trigger",
    "Require successful Security for deploy SHA",
  ]) {
    const result = spawnSync("jq", ["-r", gateJq(stepName)], { encoding: "utf8", input })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.stdout.trim().split("\n"), ["terminal:1", "active:2", "active:3", "active:4"])
  }
})

test("Security gate fails closed after its bounded wait", () => {
  const result = runWorkflowGate("Require successful Security for deploy SHA", Array(250).fill(""))

  assert.notEqual(result.status, 0)
  assert.equal(result.callLog.filter((call) => call.startsWith("api ")).length, 250)
  assert.equal(result.callLog.filter((call) => call.startsWith("sleep ")).length, 249)
})

test("workflow_run deploy trigger is Security-only and dispatches use an isolated workflow queue", () => {
  const document = deployDocument()

  assert.deepEqual(document.on.workflow_run.workflows, ["Security"])
  assert.equal(document.concurrency.group, "${{ github.event_name == 'repository_dispatch' && format('homeserver-deploy-dispatch-{0}', github.run_id) || 'homeserver-deploy-main' }}")
  assert.equal(document.concurrency.queue, "max")
})

test("dispatch waits for the exact deploy workflow run to succeed", () => {
  const result = runWorkflowGate("Require successful Deploy workflow for dispatch SHA", ["active:1", "success:1"])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.callLog.filter((call) => call.startsWith("api ")).length, 2)
  assert.deepEqual(result.callLog.filter((call) => call.startsWith("sleep ")), ["sleep 60"])
  assert.deepEqual(result.callLog.filter((call) => call.startsWith("api ")), [
    `api repos/AquilaXk/aquila-blog/actions/workflows/deploy.yml/runs?head_sha=${"a".repeat(40)}&per_page=50 --jq .workflow_runs[] | select(.event == "workflow_run" and .head_branch == "main") | if (.status == "completed" and .conclusion == "success") then "success:\\(.id)" elif .status != "completed" then "active:\\(.id)" elif .status == "completed" then "terminal:\\(.id)" else empty end`,
    `api repos/AquilaXk/aquila-blog/actions/workflows/deploy.yml/runs?head_sha=${"a".repeat(40)}&per_page=50 --jq .workflow_runs[] | select(.event == "workflow_run" and .head_branch == "main") | if (.status == "completed" and .conclusion == "success") then "success:\\(.id)" elif .status != "completed" then "active:\\(.id)" elif .status == "completed" then "terminal:\\(.id)" else empty end`,
  ])
})

for (const [label, responses, expectedApiCalls, expectedSleeps] of [
  ["terminal failure", ["terminal:1"], 1, 0],
  ["API failure", ["error"], 1, 0],
  ["bounded timeout", Array(250).fill(""), 250, 249],
]) {
  test(`dispatch Deploy workflow gate fails closed on ${label}`, () => {
    const result = runWorkflowGate("Require successful Deploy workflow for dispatch SHA", responses)

    assert.notEqual(result.status, 0)
    assert.equal(result.callLog.filter((call) => call.startsWith("api ")).length, expectedApiCalls)
    assert.equal(result.callLog.filter((call) => call.startsWith("sleep ")).length, expectedSleeps)
  })
}

test("dispatch gates query only their exact workflow paths", () => {
  for (const [stepName, workflowPath] of [
    ["Require successful CI for workflow_dispatch or Security trigger", "ci.yml"],
    ["Require successful Security for deploy SHA", "security.yml"],
  ]) {
    const result = runWorkflowGate(stepName, ["success:3"])
    assert.equal(result.status, 0, result.stderr)
    const apiCalls = result.callLog.filter((call) => call.startsWith("api "))
    assert.deepEqual(apiCalls, [
      `api repos/AquilaXk/aquila-blog/actions/workflows/${workflowPath}/runs?head_sha=${"a".repeat(40)}&per_page=50 --jq .workflow_runs[] | select(.event == "push" and .head_branch == "main") | if (.status == "completed" and .conclusion == "success") then "success:\\(.id)" elif .status != "completed" then "active:\\(.id)" elif .status == "completed" then "terminal:\\(.id)" else empty end`,
    ])
  }
})

test("Platform consumes only the Web digest handoff", () => {
  const source = deploy()

  assert.equal(existsSync(producerPath), false, "Platform must not retain the Web image producer")
  assert.match(source, /^  repository_dispatch:\n    types:\n      - web_frontend_image_ready$/m)
  assert.match(source, /WEB_FRONTEND_DISPATCH_SENDER: \$\{\{ github\.event\.sender\.login \|\| '' \}\}/)
  assert.match(source, /vars\.REPO_SYNC_APP_BOT_LOGIN/)
  assert.doesNotMatch(source, /github\.event\.sender\.login == vars\.REPO_SYNC_APP_BOT_LOGIN/)
  assert.match(source, /github\.event\.client_payload\.source_repository/)
  assert.match(source, /AquilaXk\/aquila-blog-web/)
  assert.match(source, /github\.event\.client_payload\.source_sha/)
  assert.match(source, /github\.event\.client_payload\.image_ref/)
  assert.match(source, /\^\[0-9a-f\]\{40\}\$/)
  assert.match(source, /WEB_FRONTEND_IMAGE_REF}" =~ \^ghcr\\\.io\/aquilaxk\/aquila-blog-web-front@sha256:\[0-9a-f\]\{64\}\$/)
  assert.match(source, /HOME_FRONT_IMAGE: \$\{\{ needs\.calculateTag\.outputs\.front_image_ref \}\}/)
  assert.match(source, /HOME_FRONT_BUILD_SHA: \$\{\{ needs\.calculateTag\.outputs\.front_source_sha \}\}/)
})

function runDispatch(payload) {
  const source = deploy()
  const start = source.indexOf("      - name: Calculate deploy targets and image tags")
  const end = source.indexOf("\n\n  buildAndPush:", start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const run = source.slice(start, end).match(/        run: \|\n([\s\S]*)$/)
  assert.ok(run)
  const script = run[1].replace(/^          /gm, "")
  const directory = mkdtempSync(path.join(tmpdir(), "aquila-dispatch-"))
  const output = path.join(directory, "output")
  const ghCallsOutput = path.join(directory, "gh-calls")
  const git = path.join(directory, "git")
  const gh = path.join(directory, "gh")
  writeFileSync(output, "")
  writeFileSync(ghCallsOutput, "")
  writeFileSync(
    git,
    `#!/usr/bin/env bash\ncase "$1" in\n  ls-remote|rev-parse) printf '%s\\n' "\${DEPLOY_SHA_INPUT}" ;;\n  fetch|merge-base) exit 0 ;;\n  *) echo "unexpected git args: $*" >&2; exit 1 ;;\nesac\n`,
  )
  chmodSync(git, 0o755)
  writeFileSync(
    gh,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "\${GH_CALLS_OUTPUT}"\nif [ "$1" = "api" ] && [ "$2" = "repos/AquilaXk/aquila-blog-web/commits/main" ] && [ "$3" = "--jq" ] && [ "$4" = ".sha" ] && [ "$#" = 4 ]; then\n  if [ "\${WEB_FRONTEND_GH_API_EXIT_CODE}" != "0" ]; then\n    exit "\${WEB_FRONTEND_GH_API_EXIT_CODE}"\n  fi\n  printf '%s\\n' "\${WEB_FRONTEND_CURRENT_MAIN_SHA}"\nelse\n  echo "unexpected gh args: $*" >&2\n  exit 1\nfi\n`,
  )
  chmodSync(gh, 0o755)
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "repository_dispatch",
      GITHUB_REPOSITORY_OWNER: "AquilaXk",
      GITHUB_REPOSITORY: "AquilaXk/aquila-blog",
      DEPLOY_SHA_INPUT: "a".repeat(40),
      REPO_SYNC_APP_BOT_LOGIN: "aquila-sync[bot]",
      WEB_FRONTEND_DISPATCH_SENDER: payload.sender,
      WEB_FRONTEND_SOURCE_REPOSITORY: payload.repository,
      WEB_FRONTEND_SOURCE_SHA: payload.sha,
      WEB_FRONTEND_CURRENT_MAIN_SHA: payload.currentWebMainSha ?? payload.sha,
      WEB_FRONTEND_GH_API_EXIT_CODE: String(payload.ghApiExitCode ?? 0),
      WEB_FRONTEND_IMAGE_REF: payload.image,
      GITHUB_OUTPUT: output,
      GH_CALLS_OUTPUT: ghCallsOutput,
      PATH: `${directory}:${process.env.PATH}`,
    },
  })
  const outputs = readFileSync(output, "utf8")
  const ghCalls = readFileSync(ghCallsOutput, "utf8").trim().split("\n").filter(Boolean).length
  rmSync(directory, { recursive: true, force: true })
  return { ...result, outputs, ghCalls }
}

test("dispatch payload validation executes fail-closed", () => {
  const valid = {
    sender: "aquila-sync[bot]",
    repository: "AquilaXk/aquila-blog-web",
    sha: "a".repeat(40),
    image: `ghcr.io/aquilaxk/aquila-blog-web-front@sha256:${"b".repeat(64)}`,
  }
  const accepted = runDispatch(valid)
  assert.equal(accepted.status, 0, accepted.stderr)
  assert.match(accepted.outputs, /^front_deploy=true$/m)
  assert.match(accepted.outputs, /^front_source_sha=a{40}$/m)
  assert.match(accepted.outputs, new RegExp(`^front_image_ref=${valid.image}$`, "m"))
  assert.equal(accepted.ghCalls, 1)

  const stale = runDispatch({ ...valid, currentWebMainSha: "c".repeat(40) })
  assert.notEqual(stale.status, 0)
  assert.match(stale.stderr, /repository dispatch source sha is stale/)
  assert.equal(stale.ghCalls, 1)

  for (const payload of [
    { ...valid, currentWebMainSha: "" },
    { ...valid, currentWebMainSha: "not-a-sha" },
    { ...valid, ghApiExitCode: 1 },
  ]) {
    const blocked = runDispatch(payload)
    assert.notEqual(blocked.status, 0, JSON.stringify(payload))
    assert.equal(blocked.ghCalls, 1, JSON.stringify(payload))
  }

  for (const payload of [
    { ...valid, sender: "" },
    { ...valid, sender: "other[bot]" },
    { ...valid, repository: "AquilaXk/aquila-blog-web.evil" },
    { ...valid, sha: "A".repeat(40) },
    { ...valid, sha: "a".repeat(39) },
    { ...valid, sha: `${"a".repeat(39)} ` },
    { ...valid, sha: `${"a".repeat(40)}\nattacker=true` },
    { ...valid, image: "ghcr.io/aquilaxk/aquila-blog-web-front:latest" },
    { ...valid, image: `ghcr.io/aquilaxk/aquila-blog-web-front:latest@sha256:${"b".repeat(64)}` },
    { ...valid, image: `ghcr.io.evil/aquilaxk/aquila-blog-web-front@sha256:${"b".repeat(64)}` },
    { ...valid, image: `ghcr.io/aquilaxk/aquila-blog-web-front-evil@sha256:${"b".repeat(64)}` },
    { ...valid, image: `ghcr.io/aquilaxk/aquila-blog-web-front@sha256:${"B".repeat(64)}` },
    { ...valid, image: `ghcr.io/aquilaxk/aquila-blog-web-front@sha256:${"b".repeat(63)}` },
    { ...valid, image: `${valid.image}\nattacker=true` },
  ]) {
    assert.notEqual(runDispatch(payload).status, 0, JSON.stringify(payload))
  }
})

test("handoff keeps deployment ordering and the existing SSH cutover gates", () => {
  const source = deploy()

  assert.match(source, /queue: max/)
  assert.doesNotMatch(source, /cancel-in-progress:/)
  assert.match(source, /needs\.calculateTag\.result == 'success'/)
  assert.match(source, /needs\.calculateTag\.outputs\.front_deploy == 'true'/)
  assert.match(source, /needs\.calculateTag\.outputs\.backend_deploy != 'true' \|\| needs\.blueGreenDeploy\.result == 'success'/)
  assert.match(source, /back_image_ref: \$\{\{ steps\.backend_image\.outputs\.back_image_ref \}\}/)
  assert.match(source, /HOME_BACK_IMAGE: \$\{\{ needs\.buildAndPush\.outputs\.back_image_ref \}\}/)
  const securityStep = source.match(/      - name: Require successful Security for deploy SHA\n([\s\S]*?)(?=\n      - name: Require successful Deploy workflow for dispatch SHA)/)
  assert.ok(securityStep, "Security gate step must exist")
  assert.doesNotMatch(securityStep[1], /repository_dispatch/, "Security gate must also run for dispatches")
  assert.equal((source.match(/docker\/build-push-action@/g) || []).length, 1, "only the backend build may publish")
  assert.equal((source.match(/^\s+packages: write$/gm) || []).length, 1, "only the backend build keeps package write")
  for (const forbidden of [
    "Dockerfile.runtime",
    "context: ./front",
    "context: front",
    "scope=front-image",
    "NEXT_PUBLIC_AQUILA_BUILD_SHA",
    "docker build",
    "docker push",
    "repository: AquilaXk/aquila-blog-web",
    "path: front",
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${forbidden} is Web-only`)
  }
  assert.match(source, /HOME_KNOWN_HOSTS: \$\{\{ secrets\.HOME_KNOWN_HOSTS \}\}/)
  assert.doesNotMatch(source, /ssh-keyscan/)
  assert.match(source, /trap cleanup_remote_tmp_from_runner EXIT/)
  assert.match(source, /DEPLOY_TARGET=front/)
  assert.match(source, /STAGED_FRONT_IMAGE="\$\{HOME_FRONT_IMAGE\}"/)
  assert.match(source, /STAGED_FRONT_BUILD_SHA="\$\{HOME_FRONT_BUILD_SHA\}"/)
  assert.match(source, /front deploy finished without reporting a result marker/)
  assert.match(source, /front deploy reported success but the edge served build sha=/)
})

test("dispatch front deployment joins the homeserver queue without nesting its workflow queue", () => {
  const job = deployDocument().jobs.frontBlueGreenDeploy

  assert.equal(job.concurrency.group, "${{ github.event_name == 'repository_dispatch' && 'homeserver-deploy-main' || format('homeserver-deploy-front-{0}', github.run_id) }}")
  assert.equal(job.concurrency.queue, "max")
})

function runFrontQueueFreshnessGate(input) {
  const job = deployDocument().jobs.frontBlueGreenDeploy
  const steps = job.steps || []
  const checkoutIndex = steps.findIndex((item) => item.name === "Checkout")
  const stepIndex = steps.findIndex((item) => item.name === "Verify dispatch freshness after queue")
  const secretsIndex = steps.findIndex((item) => item.name === "Verify required secrets")
  assert.notEqual(checkoutIndex, -1, "front deployment checkout must exist")
  assert.equal(stepIndex, checkoutIndex + 1, "freshness revalidation must run immediately after front checkout")
  assert.ok(secretsIndex > stepIndex, "freshness revalidation must run before secrets are read")
  const step = steps[stepIndex]
  assert.ok(step, "front deployment must revalidate dispatch freshness after acquiring the homeserver queue")
  assert.equal(step.if, "github.event_name == 'repository_dispatch'")
  const directory = mkdtempSync(path.join(tmpdir(), "aquila-front-queue-freshness-"))
  const calls = path.join(directory, "calls")
  const gh = path.join(directory, "gh")
  const git = path.join(directory, "git")
  const grep = path.join(directory, "grep")
  const changedFiles = path.join(directory, "changed-files")
  writeFileSync(calls, "")
  writeFileSync(changedFiles, input.changedFiles ?? "")
  writeFileSync(
    gh,
    `#!/usr/bin/env bash\nprintf 'gh %s\\n' "$*" >> "${calls}"\nif [ "$1" = api ] && [ "$2" = repos/AquilaXk/aquila-blog-web/commits/main ] && [ "$3" = --jq ] && [ "$4" = .sha ] && [ "$#" = 4 ]; then\n  [ "${input.webApiExitCode ?? 0}" = 0 ] || exit "${input.webApiExitCode}"\n  printf '%s\\n' '${input.webMainSha}'\n  exit 0\nfi\necho "unexpected gh args: $*" >&2\nexit 1\n`,
  )
  writeFileSync(
    git,
    `#!/usr/bin/env bash\nprintf 'git %s\\n' "$*" >> "${calls}"\n[ "$1" = '${input.gitFailureCommand ?? ""}' ] && exit 1\ncase "$1" in\n  ls-remote) printf '%s refs/heads/main\\n' '${input.platformMainSha}' ;;\n  fetch) exit 0 ;;\n  rev-parse) printf '%s\\n' '${input.fetchedPlatformMainSha ?? input.platformMainSha}' ;;\n  merge-base) exit ${input.platformAncestor === false ? 1 : 0} ;;\n  diff) cat "${changedFiles}" ;;\n  *) echo "unexpected git args: $*" >&2; exit 1 ;;\nesac\n`,
  )
  if (input.grepExitCode !== undefined) writeFileSync(grep, `#!/usr/bin/env bash\nexit ${input.grepExitCode}\n`)
  chmodSync(gh, 0o755)
  chmodSync(git, 0o755)
  if (input.grepExitCode !== undefined) chmodSync(grep, 0o755)
  const result = spawnSync("bash", ["-c", step.run], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "repository_dispatch",
      FRONT_SOURCE_SHA: input.frontSourceSha,
      DEPLOY_SHA: input.deploySha,
      PATH: `${input.grepExitCode === undefined ? "" : `${directory}:`}${directory}:${process.env.PATH}`,
    },
  })
  const callLog = readFileSync(calls, "utf8").trim().split("\n").filter(Boolean)
  rmSync(directory, { recursive: true, force: true })
  return { ...result, callLog }
}

test("front deployment revalidates the queued dispatch against exact Web and Platform main", () => {
  const input = {
    frontSourceSha: "a".repeat(40),
    webMainSha: "a".repeat(40),
    deploySha: "b".repeat(40),
    platformMainSha: "b".repeat(40),
  }
  const result = runFrontQueueFreshnessGate(input)

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.callLog, [
    "gh api repos/AquilaXk/aquila-blog-web/commits/main --jq .sha",
    `git ls-remote --exit-code origin refs/heads/main`,
    `git fetch --no-tags --prune origin +refs/heads/main:refs/remotes/origin/main`,
    `git rev-parse refs/remotes/origin/main`,
    `git merge-base --is-ancestor ${input.deploySha} ${input.platformMainSha}`,
  ])
})

for (const [label, overrides, expected] of [
  ["Web main has advanced", { webMainSha: "c".repeat(40) }, /front dispatch source sha is stale/],
  ["Web API fails", { webApiExitCode: 1 }, /front dispatch Web main sha lookup failed/],
  ["Web API returns malformed SHA", { webMainSha: "not-a-sha" }, /front dispatch current Web main sha is invalid/],
  ["Platform main contains a deployment-impacting change", { platformMainSha: "c".repeat(40), changedFiles: "deploy/homeserver/compose.yml" }, /front dispatch blocked by backend-impacting newer main changes/],
  ["Platform deploy SHA is no longer an ancestor", { platformMainSha: "c".repeat(40), platformAncestor: false }, /front dispatch deploy sha is not reachable from origin\/main/],
]) {
  test(`front deployment fails closed when ${label}`, () => {
    const result = runFrontQueueFreshnessGate({
      frontSourceSha: "a".repeat(40),
      webMainSha: "a".repeat(40),
      deploySha: "b".repeat(40),
      platformMainSha: "b".repeat(40),
      ...overrides,
    })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, expected)
  })
}

test("front deployment permits a queue-delayed Platform main advance with neutral paths only", () => {
  const result = runFrontQueueFreshnessGate({
    frontSourceSha: "a".repeat(40),
    webMainSha: "a".repeat(40),
    deploySha: "b".repeat(40),
    platformMainSha: "c".repeat(40),
    changedFiles: "docs/release-notes.md",
  })

  assert.equal(result.status, 0, result.stderr)
})

test("front deployment rejects a fetched Platform main SHA that differs from ls-remote", () => {
  const remoteMainSha = "c".repeat(40)
  const fetchedMainSha = "d".repeat(40)
  const result = runFrontQueueFreshnessGate({
    frontSourceSha: "a".repeat(40),
    webMainSha: "a".repeat(40),
    deploySha: "b".repeat(40),
    platformMainSha: remoteMainSha,
    fetchedPlatformMainSha: fetchedMainSha,
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, new RegExp(`front dispatch origin/main sha changed during stale check: remote=${remoteMainSha} fetched=${fetchedMainSha}`))
})

test("front deployment fails closed when the stale path matcher errors", () => {
  const result = runFrontQueueFreshnessGate({
    frontSourceSha: "a".repeat(40),
    webMainSha: "a".repeat(40),
    deploySha: "b".repeat(40),
    platformMainSha: "c".repeat(40),
    changedFiles: "docs/release-notes.md",
    grepExitCode: 2,
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /front dispatch stale path matcher failed: status=2/)
})

test("front deployment blocks a long changed-file list that begins with a deployment-impacting path", () => {
  const result = runFrontQueueFreshnessGate({
    frontSourceSha: "a".repeat(40),
    webMainSha: "a".repeat(40),
    deploySha: "b".repeat(40),
    platformMainSha: "c".repeat(40),
    changedFiles: `deploy/homeserver/compose.yml\n${"docs/neutral.md\n".repeat(100_000)}`,
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /front dispatch blocked by backend-impacting newer main changes/)
})

for (const command of ["ls-remote", "fetch", "rev-parse", "diff"]) {
  test(`front deployment fails closed when git ${command} fails`, () => {
    const result = runFrontQueueFreshnessGate({
      frontSourceSha: "a".repeat(40),
      webMainSha: "a".repeat(40),
      deploySha: "b".repeat(40),
      platformMainSha: "c".repeat(40),
      gitFailureCommand: command,
    })

    assert.notEqual(result.status, 0)
  })
}

test("front queue freshness uses calculateTag's exact stale deployment path pattern", () => {
  const source = deploy()
  const patterns = [...source.matchAll(/STALE_DEPLOY_BLOCK_PATHS_PATTERN='([^']+)'/g)].map((match) => match[1])
  const step = deployDocument().jobs.frontBlueGreenDeploy.steps.find((item) => item.name === "Verify dispatch freshness after queue")

  assert.equal(patterns.length, 2)
  assert.equal(patterns[1], patterns[0])
  assert.ok(step)
  assert.match(step.run, /grep -Eq "\$\{STALE_DEPLOY_BLOCK_PATHS_PATTERN\}" <<< "\$\{STALE_CHANGED_FILES\}"/)
  assert.doesNotMatch(step.run, /echo "\$\{STALE_CHANGED_FILES\}" \| grep -Eq "\$\{STALE_DEPLOY_BLOCK_PATHS_PATTERN\}"/)
})

test("Platform no longer resolves a front tag or classifies front history", () => {
  const source = deploy()

  for (const forbidden of [
    "FRONT_DEPLOY_PATHS_PATTERN",
    "git rev-list -1 --first-parent",
    "FRONT_IMAGE_WAIT_ATTEMPTS",
    "manifest_digest()",
    "registry_pull_token()",
    "FRONT_IMAGE_TAG=",
    "force_front_deploy",
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${forbidden} must be removed`)
  }
})

test("Platform has no structural path to check out, build, or push Web", () => {
  const steps = Object.values(deployDocument().jobs).flatMap((job) => job.steps || [])
  const securityGate = steps.find((step) => step.name === "Require successful Security for deploy SHA")
  assert.ok(securityGate, "Security gate step must exist")
  assert.equal(securityGate.if, undefined, "Security gate must not allowlist event types")
  assert.equal(securityGate.env.DEPLOY_SHA, "${{ github.event.workflow_run.head_sha || github.sha }}")
  const ciGate = steps.find((step) => step.name === "Require successful CI for workflow_dispatch or Security trigger")
  assert.ok(ciGate, "CI gate step must exist")
  assert.match(ciGate.if, /github\.event_name == 'repository_dispatch'/, "CI gate must run for dispatches")
  const checkouts = steps.filter((step) => typeof step.uses === "string" && step.uses.startsWith("actions/checkout@"))
  assert.ok(checkouts.length > 0)
  for (const step of checkouts) assert.equal(step.with?.repository, undefined, "checkout repository override is forbidden")

  const builds = steps.filter((step) => typeof step.uses === "string" && /^docker\/build-push-action@/i.test(step.uses))
  assert.equal(builds.length, 1)
  assert.equal(builds[0].with.context, "./back")
  assert.equal(builds[0].with.file, "./back/Dockerfile")
  assert.equal(builds[0].with.push, true)
  for (const step of steps) {
    if (step !== builds[0]) {
      assert.equal(buildAction.test(step.uses || ""), false, `build action is forbidden: ${step.uses}`)
      assert.equal("context" in (step.with || {}) || "file" in (step.with || {}) || "push" in (step.with || {}), false, "build-like action inputs are forbidden")
    }
    if (typeof step.run === "string") assert.equal(dockerCommand.test(step.run), false, `shell Docker build/push is forbidden: ${step.name}`)
  }

  assert.equal(dockerCommand.test("docker  image  push ghcr.io/x"), true)
  assert.equal(dockerCommand.test("docker buildx build ."), true)
  assert.equal(dockerCommand.test("docker buildx bake --push"), true)
  assert.equal(dockerCommand.test("docker --context unix:///var/run/docker.sock buildx bake --push"), true)
  assert.equal(dockerCommand.test("docker buildx --builder deploy bake --push"), true)
  assert.equal(dockerCommand.test(String.raw`docker --context unix:///var/run/docker.sock \
  buildx --builder deploy \
  bake --push`), true)
  assert.equal(dockerCommand.test("docker --debug manifest --insecure push ghcr.io/x"), true)
  assert.equal(dockerCommand.test("docker buildx --builder deploy imagetools --debug create ghcr.io/x"), true)
  assert.equal(dockerCommand.test("docker --context x buildx --builder y bake --push"), true)
  assert.equal(dockerCommand.test("docker --context x build"), true)
  assert.equal(dockerCommand.test("docker buildx --builder y build"), true)
  assert.equal(dockerCommand.test("docker image build ghcr.io/x"), true)
  assert.equal(dockerCommand.test("docker compose build"), true)
  assert.equal(dockerCommand.test("docker compose push"), true)
  assert.equal(dockerCommand.test("docker compose up --build"), true)
  assert.equal(dockerCommand.test("docker --context x compose -f file build"), true)
  assert.equal(dockerCommand.test("docker compose -f file up --build"), true)
  assert.equal(dockerCommand.test("docker --context x compose -f file up -d --build"), true)
  assert.equal(dockerCommand.test("docker builder build"), true)
  assert.equal(dockerCommand.test("docker builder --context x build"), true)
  assert.equal(dockerCommand.test("DOCKER_BUILDKIT=1 docker build ."), true)
  assert.equal(dockerCommand.test("sudo docker push ghcr.io/x"), true)
  assert.equal(dockerCommand.test("- run: docker build ."), true)
  assert.equal(dockerCommand.test('run: "docker build ."'), true)
  assert.equal(dockerCommand.test("printf context | docker build -"), true)
  assert.equal(dockerCommand.test("if docker build .; then true; fi"), true)
  assert.equal(dockerCommand.test(String.raw`docker --context unix:///var/run/docker.sock \
  manifest --insecure \
  push ghcr.io/x`), true)
  assert.equal(dockerCommand.test("docker buildx --builder deploy \\\r\n  imagetools --debug \\\r\n  create ghcr.io/x"), true)
  assert.equal(dockerCommand.test('echo "docker manifest push is forbidden"'), false)
  assert.equal(dockerCommand.test("# docker manifest push is forbidden"), false)
  assert.equal(dockerCommand.test("docker run --rm alpine echo build"), false)
  assert.equal(dockerCommand.test("docker pull x # manifest push"), false)
  assert.equal(buildAction.test("docker/bake-action@0123456789012345678901234567890123456789"), true)
  assert.notEqual({ repository: "${{ github.event.client_payload.repository }}" }.repository, undefined)
})
