import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const deployPath = path.join(repoRoot, ".github/workflows/deploy.yml")
const producerPath = path.join(repoRoot, ".github/workflows/frontend-image.yml")

function deploy() {
  return readFileSync(deployPath, "utf8")
}

function deployDocument() {
  const result = spawnSync("ruby", ["-e", 'require "yaml"; require "json"; puts JSON.generate(YAML.load_file(ARGV[0]))', deployPath], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

const dockerCommand = /\bdocker\s+(?:(?:image|buildx)\s+)?(?:build|push)\b/i
const buildAction = /^docker\/(?:build-push|buildx|bake)-action@/i

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
  writeFileSync(output, "")
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
      WEB_FRONTEND_IMAGE_REF: payload.image,
      GITHUB_OUTPUT: output,
    },
  })
  const outputs = readFileSync(output, "utf8")
  rmSync(directory, { recursive: true, force: true })
  return { ...result, outputs }
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
  const securityStep = source.match(/      - name: Require successful Security for deploy SHA\n([\s\S]*?)(?=\n      - name: Calculate deploy targets)/)
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
  assert.equal(buildAction.test("docker/bake-action@0123456789012345678901234567890123456789"), true)
  assert.notEqual({ repository: "${{ github.event.client_payload.repository }}" }.repository, undefined)
})
