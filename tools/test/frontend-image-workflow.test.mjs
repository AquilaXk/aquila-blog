import assert from "node:assert/strict"
import { createHash } from "node:crypto"
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

function attestationVerifyCommands(run) {
  return run.match(/gh attestation verify[\s\S]*?--format json > "[^"\n]+"/g) ?? []
}

function runDeployTriggerGuard(input) {
  const guard = deployDocument().jobs.triggerGuard
  assert.ok(guard, "deploy trigger guard job must exist")
  const step = guard.steps.find((item) => item.name === "Admit automatic Security caller")
  assert.ok(step, "deploy trigger guard step must exist")
  const directory = mkdtempSync(path.join(tmpdir(), "aquila-trigger-guard-"))
  const output = path.join(directory, "output")
  const result = spawnSync("bash", ["-c", step.run], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: input.eventName,
      GITHUB_REF: input.ref ?? "refs/heads/main",
      CALLER_WORKFLOW_REF: input.workflowRef ?? "AquilaXk/aquila-blog/.github/workflows/security.yml@refs/heads/main",
      EXPECTED_CALLER_WORKFLOW_REF: "AquilaXk/aquila-blog/.github/workflows/security.yml@refs/heads/main",
      GITHUB_OUTPUT: output,
    },
  })
  rmSync(directory, { recursive: true, force: true })
  return result
}

function runWorkflowGate(stepName, responses, options = {}) {
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
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${calls}"\nif [ "\${PAGINATED_SUCCESS_FIXTURE}" = "true" ]; then\n  for id in {1..50}; do printf 'terminal:%s\\n' "$id"; done\n  if [[ " $* " == *" --paginate "* ]]; then printf 'success:51\\n'; fi\n  exit 0\nfi\nresponse="$(head -n 1 "${responseFile}")"\ntail -n +2 "${responseFile}" > "${responseFile}.next"\nmv "${responseFile}.next" "${responseFile}"\ncase "$response" in\n  error) exit 1 ;;\n  *) printf '%s\\n' "$response" ;;\nesac\n`,
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
      SECURITY_CALLER_ADMISSION: "",
      PAGINATED_SUCCESS_FIXTURE: options.paginatedSuccessFixture ? "true" : "false",
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
    "front",
    "front/**",
    "back/**",
    "contracts/public-api/**",
    "contracts/web/**",
    "tools/contracts/**",
    "tools/test/**",
    "tools/test/public-contract-manifest.test.mjs",
    "tools/test/sync-public-contract-workflow.test.mjs",
    "tools/test/setup-node-pin-parity.test.mjs",
    "tools/test/frontend-image-workflow.test.mjs",
    "tools/test/dockerfile-supply-chain.test.mjs",
    "tools/security/native-image-evidence.mjs",
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

test("Security leaves exact-SHA runs independent", () => {
  assert.equal(securityDocument().concurrency, undefined)
})

test("Security calls Deploy only after every push security gate with minimum reusable permissions", () => {
  const security = securityDocument()
  const deploy = security.jobs.deploy

  assert.deepEqual(deploy.needs, [
    "privacy-drift-gate",
    "backend-dependency-check",
    "codeql",
    "vulnerability-exception-schema",
    "container-image-scan",
    "sbom",
  ])
  assert.equal(deploy.if, "github.event_name == 'push'")
  assert.equal(deploy.uses, "./.github/workflows/deploy.yml")
  assert.equal(deploy.secrets, "inherit")
  assert.deepEqual(deploy.permissions, {
    actions: "read",
    attestations: "write",
    contents: "read",
    "id-token": "write",
    packages: "write",
  })

  const workflow = deployDocument()
  assert.deepEqual(workflow.on.workflow_call, {})
  assert.equal(workflow.on.workflow_run, undefined)
  assert.equal(workflow.on.push, undefined)

  const triggerGuard = workflow.jobs.triggerGuard
  assert.equal(
    triggerGuard.outputs.security_caller_admission,
    "${{ steps.security_caller_admission.outputs.result }}",
  )
  const callerAdmission = triggerGuard.steps.find((step) => step.name === "Admit automatic Security caller")
  assert.ok(callerAdmission)
  assert.equal(callerAdmission.env.CALLER_WORKFLOW_REF, "${{ github.workflow_ref }}")
  assert.equal(
    callerAdmission.env.EXPECTED_CALLER_WORKFLOW_REF,
    "AquilaXk/aquila-blog/.github/workflows/security.yml@refs/heads/main",
  )
  assert.match(workflow.jobs.calculateTag.if, /needs\.triggerGuard\.outputs\.security_caller_admission == 'proceed'/)

  const calculateSteps = workflow.jobs.calculateTag.steps
  const checkout = calculateSteps.find((step) => step.name === "Checkout")
  const ciGate = calculateSteps.find((step) => step.name === "Require successful CI for deployment SHA")
  const securityGate = calculateSteps.find((step) => step.name === "Require successful Security for deploy SHA")
  const dispatchDelivery = calculateSteps.find((step) => step.name === "Require successful automatic Security delivery for dispatch SHA")
  const meta = calculateSteps.find((step) => step.name === "Calculate deploy targets and image tags")
  assert.equal(checkout.with.ref, "${{ github.sha }}")
  assert.equal(ciGate.env.DEPLOY_SHA, "${{ github.sha }}")
  assert.equal(securityGate.env.DEPLOY_SHA, "${{ github.sha }}")
  assert.equal(securityGate.env.SECURITY_CALLER_ADMISSION, "${{ needs.triggerGuard.outputs.security_caller_admission }}")
  assert.match(securityGate.run, /Security gate satisfied by the exact same-SHA caller DAG/)
  assert.equal(meta.env.DEPLOY_SHA_INPUT, "${{ github.sha }}")
  assert.match(dispatchDelivery.run, /actions\/workflows\/security\.yml\/runs\?head_sha=\$\{DEPLOY_SHA\}/)
  assert.match(dispatchDelivery.run, /\.event == "push" and \.head_branch == "main"/)
  assert.doesNotMatch(dispatchDelivery.run, /deploy\.yml\/runs|\.event == "workflow_run"/)
  assert.doesNotMatch(meta.run, /attestation-source-sha-mismatch/)

  const scan = workflow.jobs.buildAndPush.steps.find((step) => step.name === "Pull and scan immutable backend image")
  assert.doesNotMatch(scan.run, /--ignorefile|\.trivyignore\.yaml/)
})

test("deploy trigger guard permits only the exact Security main caller", () => {
  const result = runDeployTriggerGuard({ eventName: "workflow_call" })
  assert.equal(result.status, 0, result.stderr)
  for (const input of [
    { eventName: "workflow_call", workflowRef: "AquilaXk/aquila-blog/.github/workflows/ci.yml@refs/heads/main" },
    { eventName: "workflow_call", ref: "refs/heads/release" },
  ]) {
    const result = runDeployTriggerGuard(input)
    assert.notEqual(result.status, 0)
  }

  assert.deepEqual(deployDocument().jobs.calculateTag.needs, ["triggerGuard"])
})

test("calculateTag requires the trigger guard for every allowed event group", () => {
  assert.equal(
    deployDocument().jobs.calculateTag.if.replace(/\s+/g, ""),
    "needs.triggerGuard.result=='success'&&((needs.triggerGuard.outputs.security_caller_admission=='proceed'&&github.ref=='refs/heads/main')||(github.event_name=='workflow_dispatch'&&github.ref=='refs/heads/main')||(github.event_name=='repository_dispatch'&&github.event.action=='web_frontend_image_ready'&&needs.triggerGuard.outputs.dispatch_admission=='proceed'))",
  )
})

test("CI gate waits for an active matching run to succeed", () => {
  const result = runWorkflowGate("Require successful CI for deployment SHA", ["active:1", "success:1"])

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
  const result = runWorkflowGate("Require successful CI for deployment SHA", ["error"])

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
    "Require successful CI for deployment SHA",
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

test("reusable Deploy keeps dispatches on an isolated workflow queue", () => {
  const document = deployDocument()

  assert.deepEqual(document.on.workflow_call, {})
  assert.equal(document.on.workflow_run, undefined)
  assert.equal(document.concurrency.group, "${{ github.event_name == 'repository_dispatch' && format('homeserver-deploy-dispatch-{0}', github.run_id) || 'homeserver-deploy-main' }}")
  assert.equal(document.concurrency.queue, "max")
})

test("dispatch waits for the exact Platform Security delivery to succeed", () => {
  const result = runWorkflowGate("Require successful automatic Security delivery for dispatch SHA", ["active:1", "success:1"])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.callLog.filter((call) => call.startsWith("api ")).length, 2)
  assert.deepEqual(result.callLog.filter((call) => call.startsWith("sleep ")), ["sleep 60"])
  assert.deepEqual(result.callLog.filter((call) => call.startsWith("api ")), [
    `api repos/AquilaXk/aquila-blog/actions/workflows/security.yml/runs?head_sha=${"a".repeat(40)}&per_page=50 --paginate --jq .workflow_runs[] | select(.event == "push" and .head_branch == "main") | if (.status == "completed" and .conclusion == "success") then "success:\\(.id)" elif .status != "completed" then "active:\\(.id)" elif .status == "completed" then "terminal:\\(.id)" else empty end`,
    `api repos/AquilaXk/aquila-blog/actions/workflows/security.yml/runs?head_sha=${"a".repeat(40)}&per_page=50 --paginate --jq .workflow_runs[] | select(.event == "push" and .head_branch == "main") | if (.status == "completed" and .conclusion == "success") then "success:\\(.id)" elif .status != "completed" then "active:\\(.id)" elif .status == "completed" then "terminal:\\(.id)" else empty end`,
  ])
})

test("dispatch gates paginate past terminal first pages to find the exact workflow success", () => {
  for (const stepName of [
    "Require successful CI for deployment SHA",
    "Require successful Security for deploy SHA",
    "Require successful automatic Security delivery for dispatch SHA",
  ]) {
    const result = runWorkflowGate(stepName, [], { paginatedSuccessFixture: true })
    const apiCalls = result.callLog.filter((call) => call.startsWith("api "))

    assert.equal(result.status, 0, result.stderr)
    assert.equal(apiCalls.length, 1)
    assert.match(apiCalls[0], /--paginate/)
    assert.deepEqual(result.callLog.filter((call) => call.startsWith("sleep ")), [])
  }
})

test("dispatch ignores terminal Security runs until the exact main push succeeds", () => {
  const result = runWorkflowGate("Require successful automatic Security delivery for dispatch SHA", ["terminal:1", "active:2", "success:3"])
  const apiCall = `api repos/AquilaXk/aquila-blog/actions/workflows/security.yml/runs?head_sha=${"a".repeat(40)}&per_page=50 --paginate --jq .workflow_runs[] | select(.event == "push" and .head_branch == "main") | if (.status == "completed" and .conclusion == "success") then "success:\\(.id)" elif .status != "completed" then "active:\\(.id)" elif .status == "completed" then "terminal:\\(.id)" else empty end`

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.callLog.filter((call) => call.startsWith("api ")), [apiCall, apiCall, apiCall])
  assert.deepEqual(result.callLog.filter((call) => call.startsWith("sleep ")), ["sleep 60", "sleep 60"])
})

for (const [label, responses, expectedApiCalls, expectedSleeps] of [
  ["terminal-only rows after its bounded wait", Array(250).fill("terminal:1"), 250, 249],
  ["API failure", ["error"], 1, 0],
  ["bounded timeout", Array(250).fill(""), 250, 249],
]) {
  test(`dispatch automatic Security delivery gate fails closed on ${label}`, () => {
    const result = runWorkflowGate("Require successful automatic Security delivery for dispatch SHA", responses)

    assert.notEqual(result.status, 0)
    assert.equal(result.callLog.filter((call) => call.startsWith("api ")).length, expectedApiCalls)
    assert.equal(result.callLog.filter((call) => call.startsWith("sleep ")).length, expectedSleeps)
  })
}

test("dispatch gates query only their exact workflow paths", () => {
  for (const [stepName, workflowPath] of [
    ["Require successful CI for deployment SHA", "ci.yml"],
    ["Require successful Security for deploy SHA", "security.yml"],
    ["Require successful automatic Security delivery for dispatch SHA", "security.yml"],
  ]) {
    const result = runWorkflowGate(stepName, ["success:3"])
    assert.equal(result.status, 0, result.stderr)
    const apiCalls = result.callLog.filter((call) => call.startsWith("api "))
    assert.deepEqual(apiCalls, [
      `api repos/AquilaXk/aquila-blog/actions/workflows/${workflowPath}/runs?head_sha=${"a".repeat(40)}&per_page=50 --paginate --jq .workflow_runs[] | select(.event == "push" and .head_branch == "main") | if (.status == "completed" and .conclusion == "success") then "success:\\(.id)" elif .status != "completed" then "active:\\(.id)" elif .status == "completed" then "terminal:\\(.id)" else empty end`,
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
  assert.match(source, /WEB_FRONTEND_IMAGE_DIGEST}" =~ \^sha256:\[0-9a-f\]\{64\}\$/)
  assert.match(source, /WEB_FRONTEND_IMAGE_REF}" = "ghcr\.io\/aquilaxk\/aquila-blog-web-front@\$\{WEB_FRONTEND_IMAGE_DIGEST\}"/)
  assert.match(source, /HOME_FRONT_IMAGE: \$\{\{ needs\.calculateTag\.outputs\.front_image_ref \}\}/)
  assert.match(source, /HOME_FRONT_BUILD_SHA: \$\{\{ needs\.calculateTag\.outputs\.front_source_sha \}\}/)
})

test("backend image producer publishes only verified native-image evidence", () => {
  const job = deployDocument().jobs.buildAndPush
  const steps = job.steps
  const digest = steps.find((step) => step.id === "backend_image")
  const trivyInstall = steps.find((step) => step.name === "Install Trivy for backend image evidence")
  const scan = steps.find((step) => step.name === "Pull and scan immutable backend image")
  const attestations = [
    steps.find((step) => step.name === "Attest backend image provenance"),
    steps.find((step) => step.name === "Attest backend image SPDX SBOM"),
    steps.find((step) => step.name === "Attest backend image vulnerability scan"),
  ]
  const verify = steps.find((step) => step.name === "Verify backend native image attestations")

  assert.deepEqual(job.permissions, {
    contents: "read",
    packages: "write",
    attestations: "write",
    "id-token": "write",
  })
  assert.match(digest.run, /\[\[ ! "\$\{BACKEND_IMAGE_DIGEST\}" =~ \^sha256:\[a-f0-9\]\{64\}\$ \]\]/)
  assert.match(digest.run, /back_image_ref=\$\{IMAGE_NAME\}@\$\{BACKEND_IMAGE_DIGEST\}/)
  assert.equal(trivyInstall.env.TRIVY_VERSION, "0.72.0")
  assert.equal(trivyInstall.env.TRIVY_SHA256, "bbb64b9695866ce4a7a8f5c9592002c5961cab378577fa3f8a040df362b9b2ea")
  assert.equal(scan.env.IMAGE_REF, "${{ steps.backend_image.outputs.back_image_ref }}")
  assert.match(scan.run, /docker pull "\$\{IMAGE_REF\}"/)
  assert.match(scan.run, /trivy image --severity HIGH,CRITICAL[\s\S]*?--format cosign-vuln --output "\$\{RUNNER_TEMP\}\/backend-image-vulnerability\.json" "\$\{IMAGE_REF\}"/)
  assert.doesNotMatch(scan.run, /--exit-code/)
  assert.match(scan.run, /node tools\/guards\/check-vulnerability-exceptions\.mjs --filter-trivy-cosign "\$\{RUNNER_TEMP\}\/backend-image-vulnerability\.json" --expected-artifact "\$\{IMAGE_REF\}"/)
  assert.match(scan.run, /trivy image[\s\S]*?--format spdx-json --output "\$\{RUNNER_TEMP\}\/backend-image\.spdx\.json" "\$\{IMAGE_REF\}"/)
  assert.doesNotMatch(scan.run, /--ignorefile|\.trivyignore\.yaml/)
  assert.doesNotMatch(scan.run, /--format spdx-json[\s\S]*--(?:severity|exit-code)/)
  assert.match(scan.run, /backend-image-vulnerability\.json/)
  assert.match(scan.run, /backend-image\.spdx\.json/)

  for (const step of attestations) {
    assert.equal(step.uses, "actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6")
    assert.equal(step.with["subject-name"], "ghcr.io/aquilaxk/aquila-blog-back")
    assert.equal(step.with["subject-digest"], "${{ steps.build_backend_image.outputs.digest }}")
    assert.equal(step.with["push-to-registry"], true)
  }
  assert.equal(attestations[0].with["predicate-type"], undefined)
  assert.equal(attestations[0].with["predicate-path"], undefined)
  assert.equal(attestations[1].with["predicate-type"], "https://spdx.dev/Document/v2.3")
  assert.match(attestations[1].with["predicate-path"], /backend-image\.spdx\.json$/)
  assert.equal(attestations[2].with["predicate-type"], "https://cosign.sigstore.dev/attestation/vuln/v1")
  assert.match(attestations[2].with["predicate-path"], /backend-image-vulnerability\.json$/)

  assert.equal(verify.env.GH_TOKEN, "${{ github.token }}")
  assert.equal(verify.env.SOURCE_REPOSITORY, "AquilaXk/aquila-blog")
  assert.equal(verify.env.SOURCE_SHA, "${{ needs.calculateTag.outputs.deploy_sha }}")
  assert.equal(verify.env.IMAGE_SUBJECT, "ghcr.io/aquilaxk/aquila-blog-back")
  assert.equal(verify.env.IMAGE_DIGEST, "${{ steps.build_backend_image.outputs.digest }}")
  assert.equal(verify.env.EXPECTED_BUILD_TRIGGER, "${{ github.event_name }}")
  assert.equal(verify.env.SIGNER_WORKFLOW, "https://github.com/AquilaXk/aquila-blog/.github/workflows/deploy.yml@refs/heads/main")
  assert.equal(verify.env.EXPECTED_RUN_URI, "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}/attempts/${{ github.run_attempt }}")
  const verifyCommands = attestationVerifyCommands(verify.run)
  const expectedVerifications = [
    ["https://slsa.dev/provenance/v1", "backend-image-provenance.json"],
    ["https://spdx.dev/Document/v2.3", "backend-image-spdx.json"],
    ["https://cosign.sigstore.dev/attestation/vuln/v1", "backend-image-vulnerability-attestation.json"],
  ]
  assert.equal(verifyCommands.length, expectedVerifications.length)
  for (const [index, [predicate, output]] of expectedVerifications.entries()) {
    const command = verifyCommands[index]
    assert.match(command, /^gh attestation verify "oci:\/\/\$\{IMAGE_REF\}"/)
    assert.match(command, /--repo "AquilaXk\/aquila-blog"/)
    assert.match(command, /--source-digest "\$\{SOURCE_SHA\}"/)
    assert.match(command, /--source-ref "refs\/heads\/main"/)
    assert.match(command, /--signer-workflow "AquilaXk\/aquila-blog\/\.github\/workflows\/deploy\.yml"/)
    assert.match(command, /--signer-digest "\$\{SOURCE_SHA\}"/)
    assert.match(command, /--deny-self-hosted-runners/)
    assert.match(command, new RegExp(`--predicate-type "${predicate.replaceAll("/", "\\/")}"`))
    assert.match(command, new RegExp(`--format json > "\\$\\{RUNNER_TEMP\\}\/${output}"$`))
  }
  assert.match(verify.run, /node tools\/security\/native-image-evidence\.mjs verify-attestation-set[\s\S]*backend-image-provenance\.json[\s\S]*backend-image-spdx\.json[\s\S]*backend-image-vulnerability-attestation\.json/)
  const verifierIndex = verify.run.indexOf("node tools/security/native-image-evidence.mjs verify-attestation-set")
  const summaryIndex = verify.run.indexOf('>> "${GITHUB_STEP_SUMMARY}"')
  assert.ok(summaryIndex > verifierIndex, "summary must be written only after local attestation verification")
  for (const value of [
    "aquila-native-image-evidence-v1",
    "${SOURCE_SHA}",
    "${IMAGE_DIGEST}",
    "https://slsa.dev/provenance/v1",
    "https://spdx.dev/Document/v2.3",
    "https://cosign.sigstore.dev/attestation/vuln/v1",
    "${SIGNER_WORKFLOW}",
    "${EXPECTED_RUN_URI}",
  ]) assert.match(verify.run, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("dispatch front deployment admits only native Web image evidence after freshness", () => {
  const job = deployDocument().jobs.frontBlueGreenDeploy
  const steps = job.steps
  const freshnessIndex = steps.findIndex((step) => step.name === "Verify dispatch freshness after queue")
  const loginIndex = steps.findIndex((step) => step.name === "Login to GHCR for Web native admission")
  const verifyIndex = steps.findIndex((step) => step.name === "Verify Web native image attestations")
  const secretsIndex = steps.findIndex((step) => step.name === "Verify required secrets")
  const login = steps[loginIndex]
  const verify = steps[verifyIndex]
  const proceedOnly = "github.event_name == 'repository_dispatch' && steps.freshness.outputs.result == 'proceed'"

  assert.deepEqual(job.permissions, {
    contents: "read",
    packages: "read",
    attestations: "read",
  })
  assert.equal(loginIndex, freshnessIndex + 1)
  assert.equal(verifyIndex, loginIndex + 1)
  assert.equal(secretsIndex, verifyIndex + 1)
  assert.equal(login.if, proceedOnly)
  assert.equal(login.uses, "docker/login-action@dbcb813823bdd20940b903addbd779551569679f")
  assert.deepEqual(login.with, {
    registry: "ghcr.io",
    username: "${{ github.actor }}",
    password: "${{ github.token }}",
  })
  assert.equal(verify.if, proceedOnly)
  assert.equal(verify.env.GH_TOKEN, "${{ github.token }}")
  assert.equal(verify.env.IMAGE_REF, "${{ needs.calculateTag.outputs.front_image_ref }}")
  assert.equal(verify.env.SOURCE_REPOSITORY, "AquilaXk/aquila-blog-web")
  assert.equal(verify.env.SOURCE_SHA, "${{ needs.calculateTag.outputs.front_source_sha }}")
  assert.equal(verify.env.IMAGE_SUBJECT, "ghcr.io/aquilaxk/aquila-blog-web-front")
  assert.equal(verify.env.IMAGE_DIGEST, "${{ github.event.client_payload.image_digest }}")
  assert.equal(verify.env.EXPECTED_BUILD_TRIGGER, "push")
  assert.equal(verify.env.SIGNER_WORKFLOW, "https://github.com/AquilaXk/aquila-blog-web/.github/workflows/frontend-image.yml@refs/heads/main")
  assert.equal(verify.env.EXPECTED_RUN_URI, "https://github.com/AquilaXk/aquila-blog-web/actions/runs/${{ github.event.client_payload.producer_run_id }}/attempts/${{ github.event.client_payload.producer_run_attempt }}")
  assert.doesNotMatch(verify.run, /secrets\.|app token|tailscale|ssh/i)

  const verifyCommands = attestationVerifyCommands(verify.run)
  const expectedVerifications = [
    ["https://slsa.dev/provenance/v1", "web-image-provenance.json"],
    ["https://spdx.dev/Document/v2.3", "web-image-spdx.json"],
    ["https://cosign.sigstore.dev/attestation/vuln/v1", "web-image-vulnerability-attestation.json"],
  ]
  assert.equal(verifyCommands.length, expectedVerifications.length)
  for (const [index, [predicate, output]] of expectedVerifications.entries()) {
    const command = verifyCommands[index]
    assert.match(command, /^gh attestation verify "oci:\/\/\$\{IMAGE_REF\}"/)
    assert.match(command, /--repo "AquilaXk\/aquila-blog-web"/)
    assert.match(command, /--source-digest "\$\{SOURCE_SHA\}"/)
    assert.match(command, /--source-ref "refs\/heads\/main"/)
    assert.match(command, /--signer-workflow "AquilaXk\/aquila-blog-web\/\.github\/workflows\/frontend-image\.yml"/)
    assert.match(command, /--signer-digest "\$\{SOURCE_SHA\}"/)
    assert.match(command, /--deny-self-hosted-runners/)
    assert.match(command, new RegExp(`--predicate-type "${predicate.replaceAll("/", "\\/")}"`))
    assert.match(command, new RegExp(`--format json > "\\$\\{RUNNER_TEMP\\}\\/${output}"$`))
  }
  assert.match(verify.run, /node tools\/security\/native-image-evidence\.mjs verify-attestation-set[\s\S]*web-image-provenance\.json[\s\S]*web-image-spdx\.json[\s\S]*web-image-vulnerability-attestation\.json/)
  const verifierIndex = verify.run.indexOf("node tools/security/native-image-evidence.mjs verify-attestation-set")
  const summaryIndex = verify.run.indexOf('>> "${GITHUB_STEP_SUMMARY}"')
  assert.ok(summaryIndex > verifierIndex, "summary must be written only after local attestation verification")
  for (const value of [
    "aquila-native-image-evidence-v1",
    "${SOURCE_SHA}",
    "${IMAGE_DIGEST}",
    "https://slsa.dev/provenance/v1",
    "https://spdx.dev/Document/v2.3",
    "https://cosign.sigstore.dev/attestation/vuln/v1",
    "${SIGNER_WORKFLOW}",
    "${EXPECTED_RUN_URI}",
  ]) assert.match(verify.run, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

function runVerifiedDeploymentDispatch(input) {
  const steps = deployDocument().jobs.frontBlueGreenDeploy.steps
  const step = steps.find((item) => item.name === "Dispatch verified Platform deployment")
  assert.ok(step, "verified deployment dispatch step must exist")
  const directory = mkdtempSync(path.join(tmpdir(), "aquila-verified-deployment-dispatch-"))
  const calls = path.join(directory, "calls")
  const output = path.join(directory, "output")
  const payload = path.join(directory, "payload.json")
  const gh = path.join(directory, "gh")
  writeFileSync(calls, "")
  writeFileSync(output, "")
  writeFileSync(
    gh,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${calls}"\n[ "$1" = api ] && [ "$2" = --method ] && [ "$3" = POST ] && [ "$4" = repos/AquilaXk/aquila-blog-web/dispatches ] && [ "$5" = --input ] && [ "$7" = --silent ] && [ "$#" = 7 ] || exit 1\ncp "$6" "${payload}"\n`,
  )
  chmodSync(gh, 0o755)
  const result = spawnSync("bash", ["-c", step.run], {
    encoding: "utf8",
    env: {
      ...process.env,
      PLATFORM_REPOSITORY: "AquilaXk/aquila-blog",
      PLATFORM_SHA: "a".repeat(40),
      WEB_REPOSITORY: "AquilaXk/aquila-blog-web",
      WEB_SHA: "b".repeat(40),
      IMAGE_REF: `ghcr.io/aquilaxk/aquila-blog-web-front@sha256:${"c".repeat(64)}`,
      DEPLOY_RUN_ID: "12345",
      DOMAIN: "https://blog.aquilaxk.site",
      SERVED_BUILD_SHA: input.servedBuildSha ?? "b".repeat(40),
      DISPATCH_PAYLOAD_FILE: path.join(directory, "dispatch.json"),
      GITHUB_OUTPUT: output,
      PATH: `${directory}:${process.env.PATH}`,
    },
  })
  const callLog = readFileSync(calls, "utf8").trim().split("\n").filter(Boolean)
  const outputText = readFileSync(output, "utf8")
  const payloadDocument = existsSync(payload) ? JSON.parse(readFileSync(payload, "utf8")) : null
  rmSync(directory, { recursive: true, force: true })
  return { ...result, callLog, outputText, payloadDocument }
}

test("verified front result dispatches one exact Web receiver event with least privilege", () => {
  const steps = deployDocument().jobs.frontBlueGreenDeploy.steps
  const deployStep = steps.find((item) => item.name === "Deploy front over SSH (pull image + blue/green switch)")
  const token = steps.find((item) => item.name === "Create Web repository dispatch token")
  const dispatch = steps.find((item) => item.name === "Dispatch verified Platform deployment")
  const summary = steps.find((item) => item.name === "Record verified Platform deployment event")
  const verifiedCondition = "github.event_name == 'repository_dispatch' && steps.front-deploy.outputs.verified == 'true'"

  assert.equal(deployStep.id, "front-deploy")
  assert.match(deployStep.run, /FRONT_DEPLOY_RESULT[\s\S]*deployed \| noop\) ;;/)
  assert.match(deployStep.run, /FRONT_SERVED_BUILD_SHA[\s\S]*HOME_FRONT_BUILD_SHA/)
  assert.match(deployStep.run, /verified=true/)
  assert.equal(token.if, verifiedCondition)
  assert.equal(token.uses, "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1")
  assert.deepEqual(token.with, {
    "client-id": "${{ vars.REPO_SYNC_APP_CLIENT_ID }}",
    "private-key": "${{ secrets.REPO_SYNC_APP_PRIVATE_KEY }}",
    owner: "AquilaXk",
    repositories: "aquila-blog-web",
    "permission-contents": "write",
  })
  assert.ok(dispatch, "verified deployment dispatch step must exist")
  assert.equal(dispatch.if, verifiedCondition)
  assert.equal(dispatch.env.GH_TOKEN, "${{ steps.web-dispatch-token.outputs.token }}")
  assert.match(dispatch.run, /platform_web_deployment_ready/)
  assert.match(dispatch.run, /repos\/\$\{WEB_REPOSITORY\}\/dispatches/)
  assert.doesNotMatch(dispatch.run, /retry|sleep|callback/i)
  assert.equal(summary.if, `${verifiedCondition} && steps.verified-event.outcome == 'success'`)
  assert.equal(summary.env.DEPLOYMENT_IDENTITY, "${{ steps.verified-event.outputs.deployment_identity }}")
  assert.doesNotMatch(JSON.stringify(summary), /GH_TOKEN|PRIVATE_KEY|CLIENT_ID/)

  const valid = runVerifiedDeploymentDispatch({})
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(valid.callLog.length, 1)
  assert.equal(valid.payloadDocument.event_type, "platform_web_deployment_ready")
  const payloadKeys = [
    "schema_version", "platform_repository", "platform_sha", "web_repository", "web_sha",
    "image_digest", "deploy_run_id", "domain", "served_build_sha", "deployment_identity",
  ]
  assert.deepEqual(Object.keys(valid.payloadDocument.client_payload), payloadKeys)
  const clientPayload = valid.payloadDocument.client_payload
  const expected = {
    schema_version: "1",
    platform_repository: "AquilaXk/aquila-blog",
    platform_sha: "a".repeat(40),
    web_repository: "AquilaXk/aquila-blog-web",
    web_sha: "b".repeat(40),
    image_digest: `sha256:${"c".repeat(64)}`,
    deploy_run_id: "12345",
    domain: "https://blog.aquilaxk.site",
    served_build_sha: "b".repeat(40),
  }
  for (const [key, value] of Object.entries(expected)) assert.equal(clientPayload[key], value)
  const canonical = payloadKeys.slice(0, -1).map((key) => `${key}=${clientPayload[key]}\n`).join("")
  assert.equal(clientPayload.deployment_identity, createHash("sha256").update(canonical).digest("hex"))
  assert.match(valid.outputText, new RegExp(`^deployment_identity=${clientPayload.deployment_identity}$`, "m"))

  const mismatch = runVerifiedDeploymentDispatch({ servedBuildSha: "d".repeat(40) })
  assert.notEqual(mismatch.status, 0)
  assert.deepEqual(mismatch.callLog, [])
  assert.equal(mismatch.payloadDocument, null)
})

function dispatchPayload(overrides = {}) {
  const payload = {
    schemaVersion: "1",
    sender: "aquila-sync[bot]",
    sourceRepository: "AquilaXk/aquila-blog-web",
    sourceSha: "a".repeat(40),
    imageDigest: `sha256:${"b".repeat(64)}`,
    targetRepository: "AquilaXk/aquila-blog",
    targetSha: "c".repeat(40),
    producerRunId: "12345",
    producerRunAttempt: "1",
    ...overrides,
  }
  payload.imageRef ??= `ghcr.io/aquilaxk/aquila-blog-web-front@${payload.imageDigest}`
  payload.deliveryId ??= createHash("sha256").update([
    `schema_version=${payload.schemaVersion}`,
    `source_repository=${payload.sourceRepository}`,
    `source_sha=${payload.sourceSha}`,
    `image_digest=${payload.imageDigest}`,
    `target_repository=${payload.targetRepository}`,
    `target_sha=${payload.targetSha}`,
    "",
  ].join("\n")).digest("hex")
  return payload
}

function runDispatchAdmission(payload) {
  const guard = deployDocument().jobs.triggerGuard
  const step = guard.steps.find((item) => item.name === "Admit Web image-ready dispatch")
  assert.ok(step, "dispatch admission step must exist")
  const directory = mkdtempSync(path.join(tmpdir(), "aquila-dispatch-"))
  const output = path.join(directory, "output")
  const summary = path.join(directory, "summary")
  const ghCallsOutput = path.join(directory, "gh-calls")
  const gh = path.join(directory, "gh")
  writeFileSync(output, "")
  writeFileSync(summary, "")
  writeFileSync(ghCallsOutput, "")
  writeFileSync(
    gh,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "\${GH_CALLS_OUTPUT}"\nif [ "\${WEB_FRONTEND_GH_API_EXIT_CODE}" != "0" ]; then exit "\${WEB_FRONTEND_GH_API_EXIT_CODE}"; fi\ncase "$2" in\n  repos/AquilaXk/aquila-blog-web/commits/main) printf '%s\\n' "\${WEB_FRONTEND_CURRENT_MAIN_SHA}" ;;\n  repos/AquilaXk/aquila-blog/commits/main) printf '%s\\n' "\${PLATFORM_CURRENT_MAIN_SHA}" ;;\n  *) echo "unexpected gh args: $*" >&2; exit 1 ;;\nesac\n`,
  )
  chmodSync(gh, 0o755)
  const result = spawnSync("bash", ["-c", step.run], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "repository_dispatch",
      GITHUB_REPOSITORY: "AquilaXk/aquila-blog",
      GITHUB_SHA: payload.eventTargetSha ?? payload.targetSha,
      REPO_SYNC_APP_BOT_LOGIN: "aquila-sync[bot]",
      WEB_FRONTEND_SCHEMA_VERSION: payload.schemaVersion,
      WEB_FRONTEND_DISPATCH_SENDER: payload.sender,
      WEB_FRONTEND_SOURCE_REPOSITORY: payload.sourceRepository,
      WEB_FRONTEND_SOURCE_SHA: payload.sourceSha,
      WEB_FRONTEND_IMAGE_REF: payload.imageRef,
      WEB_FRONTEND_IMAGE_DIGEST: payload.imageDigest,
      WEB_FRONTEND_TARGET_REPOSITORY: payload.targetRepository,
      WEB_FRONTEND_TARGET_SHA: payload.targetSha,
      WEB_FRONTEND_DELIVERY_ID: payload.deliveryId,
      WEB_FRONTEND_PRODUCER_RUN_ID: payload.producerRunId,
      WEB_FRONTEND_PRODUCER_RUN_ATTEMPT: payload.producerRunAttempt,
      WEB_FRONTEND_CURRENT_MAIN_SHA: payload.currentSourceMainSha ?? payload.sourceSha,
      PLATFORM_CURRENT_MAIN_SHA: payload.currentTargetMainSha ?? payload.targetSha,
      WEB_FRONTEND_GH_API_EXIT_CODE: String(payload.ghApiExitCode ?? 0),
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      GH_CALLS_OUTPUT: ghCallsOutput,
      PATH: `${directory}:${process.env.PATH}`,
    },
  })
  const outputs = readFileSync(output, "utf8")
  const summaryText = readFileSync(summary, "utf8")
  const ghCalls = readFileSync(ghCallsOutput, "utf8").trim().split("\n").filter(Boolean).length
  rmSync(directory, { recursive: true, force: true })
  return { ...result, outputs, summaryText, ghCalls }
}

test("dispatch admission validates the signed Web image handoff before deploy gates", () => {
  const valid = dispatchPayload()
  const accepted = runDispatchAdmission(valid)
  assert.equal(accepted.status, 0, accepted.stderr)
  assert.match(accepted.outputs, /^result=proceed$/m)
  assert.match(accepted.summaryText, /result: proceed/)
  assert.equal(accepted.ghCalls, 2)

  for (const payload of [
    dispatchPayload({ schemaVersion: "2" }),
    dispatchPayload({ sender: "other[bot]" }),
    dispatchPayload({ sourceRepository: "AquilaXk/aquila-blog-web.evil" }),
    dispatchPayload({ sourceSha: "A".repeat(40) }),
    dispatchPayload({ imageDigest: `sha256:${"B".repeat(64)}` }),
    dispatchPayload({ targetRepository: "AquilaXk/other" }),
    dispatchPayload({ targetSha: "d".repeat(40), eventTargetSha: "c".repeat(40) }),
    dispatchPayload({ deliveryId: "0".repeat(64) }),
    dispatchPayload({ producerRunId: "0" }),
    dispatchPayload({ producerRunAttempt: "not-a-number" }),
    dispatchPayload({ imageRef: "ghcr.io/aquilaxk/aquila-blog-web-front:latest" }),
  ]) assert.notEqual(runDispatchAdmission(payload).status, 0, JSON.stringify(payload))

  for (const payload of [
    dispatchPayload({ currentSourceMainSha: "" }),
    dispatchPayload({ currentTargetMainSha: "not-a-sha" }),
    dispatchPayload({ ghApiExitCode: 1 }),
  ]) assert.notEqual(runDispatchAdmission(payload).status, 0, JSON.stringify(payload))
})

test("stale dispatch admission is a credential-safe no-op before deploy gates", () => {
  for (const payload of [
    dispatchPayload({ currentSourceMainSha: "d".repeat(40) }),
    dispatchPayload({ currentTargetMainSha: "d".repeat(40) }),
  ]) {
    const result = runDispatchAdmission(payload)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.outputs, /^result=noop$/m)
    assert.match(result.summaryText, /result: noop/)
    assert.equal(result.ghCalls, 2)
  }
})

test("dispatch no-op skips calculateTag and every deploy gate", () => {
  const document = deployDocument()

  assert.equal(document.jobs.triggerGuard.outputs.dispatch_admission, "${{ steps.dispatch_admission.outputs.result }}")
  assert.match(document.jobs.calculateTag.if, /needs\.triggerGuard\.outputs\.dispatch_admission == 'proceed'/)
  assert.deepEqual(document.jobs.calculateTag.needs, ["triggerGuard"])
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
  const securityStep = source.match(/      - name: Require successful Security for deploy SHA\n([\s\S]*?)(?=\n      - name: Require successful automatic Security delivery for dispatch SHA)/)
  assert.ok(securityStep, "Security gate step must exist")
  assert.match(securityStep[1], /if: github\.event_name != 'repository_dispatch'/)
  assert.match(source, /Require successful automatic Security delivery for dispatch SHA/)
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
  assert.match(source, /deployed \| noop\) ;;/)
  assert.match(source, /front deploy finished without reporting a supported result marker/)
  assert.doesNotMatch(source, /if \[ "\$\{FRONT_DEPLOY_RESULT\}" = "deployed" \] && \[ "\$\{FRONT_SERVED_BUILD_SHA\}"/)
  assert.match(source, /if \[ "\$\{FRONT_SERVED_BUILD_SHA\}" != "\$\{HOME_FRONT_BUILD_SHA\}" \]; then/)
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
  const output = path.join(directory, "output")
  const summary = path.join(directory, "summary")
  writeFileSync(calls, "")
  writeFileSync(changedFiles, input.changedFiles ?? "")
  writeFileSync(output, "")
  writeFileSync(summary, "")
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
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      PATH: `${input.grepExitCode === undefined ? "" : `${directory}:`}${directory}:${process.env.PATH}`,
    },
  })
  const callLog = readFileSync(calls, "utf8").trim().split("\n").filter(Boolean)
  const outputs = readFileSync(output, "utf8")
  const summaryOutput = readFileSync(summary, "utf8")
  rmSync(directory, { recursive: true, force: true })
  return { ...result, outputs, summaryOutput, callLog }
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
  assert.match(result.outputs, /^result=proceed$/m)
  assert.match(result.summaryOutput, /## Web dispatch queue freshness/)
  assert.match(result.summaryOutput, /- result: proceed/)
  assert.match(result.summaryOutput, /- reason: current/)
  assert.match(result.summaryOutput, new RegExp(`- source Web SHA: ${input.frontSourceSha}`))
  assert.match(result.summaryOutput, new RegExp(`- current Web SHA: ${input.webMainSha}`))
  assert.match(result.summaryOutput, new RegExp(`- deploy Platform SHA: ${input.deploySha}`))
  assert.match(result.summaryOutput, new RegExp(`- current Platform SHA: ${input.platformMainSha}`))
  assert.deepEqual(result.callLog, [
    "gh api repos/AquilaXk/aquila-blog-web/commits/main --jq .sha",
    `git ls-remote --exit-code origin refs/heads/main`,
    `git fetch --no-tags --prune origin +refs/heads/main:refs/remotes/origin/main`,
    `git rev-parse refs/remotes/origin/main`,
    `git merge-base --is-ancestor ${input.deploySha} ${input.platformMainSha}`,
  ])
})

test("repository dispatch keeps the Platform deploy SHA separate from the Web source SHA", () => {
  const step = deployDocument().jobs.calculateTag.steps.find((item) => item.name === "Calculate deploy targets and image tags")

  assert.ok(step)
  assert.equal(step.env.DEPLOY_SHA_INPUT, "${{ github.sha }}")
  assert.equal(step.env.WEB_FRONTEND_SOURCE_SHA, "${{ github.event.client_payload.source_sha || '' }}")
  assert.match(step.run, /DEPLOY_SHA="\$\{DEPLOY_SHA_INPUT:-\}"/)
  assert.match(step.run, /FRONT_SOURCE_SHA="\$\{WEB_FRONTEND_SOURCE_SHA\}"/)
  assert.doesNotMatch(step.run, /workflow_run|attestation-source-sha-mismatch/)
})

for (const [label, overrides, expected] of [
  ["Web API fails", { webApiExitCode: 1 }, /front dispatch Web main sha lookup failed/],
  ["Web API returns malformed SHA", { webMainSha: "not-a-sha" }, /front dispatch current Web main sha is invalid/],
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

test("front deployment no-ops when Web main advances while queued", () => {
  const result = runFrontQueueFreshnessGate({
    frontSourceSha: "a".repeat(40),
    webMainSha: "c".repeat(40),
    deploySha: "b".repeat(40),
    platformMainSha: "b".repeat(40),
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.outputs, /^result=noop$/m)
  assert.match(result.summaryOutput, /## Web dispatch queue freshness/)
  assert.match(result.summaryOutput, /- result: noop/)
  assert.match(result.summaryOutput, /- reason: stale-web-source/)
  assert.match(result.summaryOutput, /- current Platform SHA: unavailable/)
  assert.deepEqual(result.callLog, ["gh api repos/AquilaXk/aquila-blog-web/commits/main --jq .sha"])
})

test("front deployment no-ops when queued Platform changes affect deployment", () => {
  const result = runFrontQueueFreshnessGate({
    frontSourceSha: "a".repeat(40),
    webMainSha: "a".repeat(40),
    deploySha: "b".repeat(40),
    platformMainSha: "c".repeat(40),
    changedFiles: "deploy/homeserver/compose.yml",
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.outputs, /^result=noop$/m)
  assert.match(result.summaryOutput, /## Web dispatch queue freshness/)
  assert.match(result.summaryOutput, /- result: noop/)
  assert.match(result.summaryOutput, /- reason: newer-platform-deployment-change/)
  assert.match(result.summaryOutput, new RegExp(`- current Platform SHA: ${"c".repeat(40)}`))
})

test("front deployment permits a queue-delayed Platform main advance with neutral paths only", () => {
  const result = runFrontQueueFreshnessGate({
    frontSourceSha: "a".repeat(40),
    webMainSha: "a".repeat(40),
    deploySha: "b".repeat(40),
    platformMainSha: "c".repeat(40),
    changedFiles: "docs/release-notes.md",
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.outputs, /^result=proceed$/m)
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

test("front deployment no-ops a long changed-file list that begins with a deployment-impacting path", () => {
  const result = runFrontQueueFreshnessGate({
    frontSourceSha: "a".repeat(40),
    webMainSha: "a".repeat(40),
    deploySha: "b".repeat(40),
    platformMainSha: "c".repeat(40),
    changedFiles: `deploy/homeserver/compose.yml\n${"docs/neutral.md\n".repeat(100_000)}`,
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.outputs, /^result=noop$/m)
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
  assert.match(patterns[0], /\\\.github\/security\/vulnerability-exceptions\\\.yml/)
  assert.ok(step)
  assert.match(step.run, /grep -Eq "\$\{STALE_DEPLOY_BLOCK_PATHS_PATTERN\}" <<< "\$\{STALE_CHANGED_FILES\}"/)
  assert.doesNotMatch(step.run, /echo "\$\{STALE_CHANGED_FILES\}" \| grep -Eq "\$\{STALE_DEPLOY_BLOCK_PATHS_PATTERN\}"/)
})

test("front queue no-op stops before secrets and activation", () => {
  const steps = deployDocument().jobs.frontBlueGreenDeploy.steps
  const freshness = steps.find((item) => item.name === "Verify dispatch freshness after queue")
  const nativeLogin = steps.find((item) => item.name === "Login to GHCR for Web native admission")
  const nativeVerification = steps.find((item) => item.name === "Verify Web native image attestations")
  const condition = "github.event_name != 'repository_dispatch' || steps.freshness.outputs.result == 'proceed'"

  assert.equal(freshness.id, "freshness")
  assert.equal(nativeLogin.if, "github.event_name == 'repository_dispatch' && steps.freshness.outputs.result == 'proceed'", "native admission login must skip after a queue no-op")
  assert.equal(nativeVerification.if, "github.event_name == 'repository_dispatch' && steps.freshness.outputs.result == 'proceed'", "native verification must skip after a queue no-op")
  for (const name of [
    "Verify required secrets",
    "Connect to Tailscale",
    "Configure SSH key",
    "Deploy front over SSH (pull image + blue/green switch)",
  ]) assert.equal(steps.find((item) => item.name === name).if, condition, `${name} must skip after a queue no-op`)
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
  assert.equal(securityGate.if, "github.event_name != 'repository_dispatch'")
  assert.equal(securityGate.env.DEPLOY_SHA, "${{ github.sha }}")
  const ciGate = steps.find((step) => step.name === "Require successful CI for deployment SHA")
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
