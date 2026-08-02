import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

import { resolveLiveTarget } from "./resolve-live-targets.mjs"

const sourceCommit = "a".repeat(40)

test("ready uses the immutable Vercel URL as the blocking deployment check target", () => {
  assert.deepEqual(resolveLiveTarget({
    eventType: "vercel.deployment.ready",
    deploymentUrl: "https://aquila-blog-web-a1b2c3d4e-aquilaxks-projects.vercel.app",
    environment: "production",
    sourceCommit,
  }), {
    phase: "ready",
    webUrl: "https://aquila-blog-web-a1b2c3d4e-aquilaxks-projects.vercel.app",
    checkName: "Vercel - aquila-blog-web: production-ready",
    requiresCredentials: false,
    sourceCommit,
  })
})

test("promoted verifies the production custom domain with a distinct status", () => {
  assert.deepEqual(resolveLiveTarget({
    eventType: "vercel.deployment.promoted",
    deploymentUrl: "https://aquila-blog-web-a1b2c3d4e-aquilaxks-projects.vercel.app",
    environment: "production",
    sourceCommit,
  }), {
    phase: "promoted",
    webUrl: "https://blog.aquilaxk.site",
    checkName: "Vercel - aquila-blog-web: production-promoted",
    requiresCredentials: true,
    sourceCommit,
  })
})

test("manual dispatch follows the ready gate and rejects mutable or insecure targets", () => {
  assert.equal(resolveLiveTarget({
    eventType: "workflow_dispatch",
    deploymentUrl: "https://aquila-blog-web-b7c8d9e0f-aquilaxks-projects.vercel.app/",
    environment: "production",
    sourceCommit: "",
  }).webUrl, "https://aquila-blog-web-b7c8d9e0f-aquilaxks-projects.vercel.app")

  for (const deploymentUrl of [
    "http://aquila-blog-web.vercel.app",
    "https://unrelated.vercel.app",
    "https://blog.aquilaxk.site",
    "https://aquila-blog-web-git-main-aquilaxks-projects.vercel.app",
    "https://aquila-blog-web-aquilaxks-projects.vercel.app",
    "https://aquila-blog-web-aquila-xk.vercel.app",
    "https://aquila-blog-web-a1b2c3d4e-other-team.vercel.app",
  ]) {
    assert.throws(() => resolveLiveTarget({ eventType: "vercel.deployment.ready", deploymentUrl, environment: "production", sourceCommit }))
  }
  assert.throws(() => resolveLiveTarget({
    eventType: "vercel.deployment.ready",
    deploymentUrl: "https://aquila-blog-web-a1b2c3d4e-aquilaxks-projects.vercel.app",
    environment: "production",
  }))
  assert.throws(() => resolveLiveTarget({
    eventType: "vercel.deployment.ready",
    deploymentUrl: "https://aquila-blog-web-a1b2c3d4e-aquilaxks-projects.vercel.app",
    environment: "production",
    sourceCommit: "invalid",
  }))
  assert.throws(() => resolveLiveTarget({
    eventType: "vercel.deployment.ready",
    deploymentUrl: "https://aquila-blog-web.vercel.app",
    environment: "preview",
  }))
})

test("CLI writes only validated values to GITHUB_OUTPUT", () => {
  const output = path.join(mkdtempSync(path.join(tmpdir(), "live-targets-")), "output")
  const result = spawnSync(process.execPath, [
    path.resolve(import.meta.dirname, "resolve-live-targets.mjs"),
    "--event-type", "vercel.deployment.ready",
    "--deployment-url", "https://aquila-blog-web-c1d2e3f4g-aquilaxks-projects.vercel.app",
    "--environment", "production",
    "--source-commit", sourceCommit,
    "--github-output", output,
  ], { encoding: "utf8" })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(output, "utf8"), [
    "phase=ready",
    "web_url=https://aquila-blog-web-c1d2e3f4g-aquilaxks-projects.vercel.app",
    "check_name=Vercel - aquila-blog-web: production-ready",
    "requires_credentials=false",
    `source_commit=${sourceCommit}`,
    "",
  ].join("\n"))
})

test("production workflow keeps ready and promoted checks separate", () => {
  const workflow = readFileSync(path.resolve(import.meta.dirname, "../../.github/workflows/production-live-verify.yml"), "utf8")
  const vercelActionSha = "30f760c6640485cd92f8c785ef361382555fb712"
  const readyValidation = "node scripts/env/validate-env.mjs --target live-ready --process-env"
  const readyPlaywright = "yarn playwright test e2e/live.spec.ts --project=chromium --workers=1"

  assert.match(workflow, /vercel\.deployment\.ready/)
  assert.match(workflow, /vercel\.deployment\.promoted/)
  assert.match(workflow, new RegExp(`vercel/repository-dispatch/actions/checkout@${vercelActionSha}`))
  assert.match(workflow, new RegExp(`vercel/repository-dispatch/actions/status@${vercelActionSha}`))
  assert.doesNotMatch(workflow, /vercel\/repository-dispatch\/actions\/(?:checkout|status)@v1/)
  assert.match(workflow, /Vercel - aquila-blog-web: production-ready/)
  assert.match(workflow, /Vercel - aquila-blog-web: production-promoted/)
  assert.match(workflow, /steps\.targets\.outputs\.phase == 'ready'/)
  assert.match(workflow, /steps\.targets\.outputs\.phase == 'promoted'/)
  assert.match(workflow, /LIVE_SOURCE_COMMIT: \$\{\{ github\.event\.client_payload\.git\.sha \|\| '' \}\}/)
  assert.match(workflow, /--source-commit "\$\{LIVE_SOURCE_COMMIT\}"/)
  assert.match(workflow, /E2E_EXPECTED_FRONT_COMMIT_SHA: \$\{\{ steps\.targets\.outputs\.source_commit \}\}/)
  assert.doesNotMatch(workflow, /E2E_EXPECTED_FRONT_COMMIT_SHA: \$\{\{ github\.event\.client_payload\.git\.sha \}\}/)
  assert.match(workflow, new RegExp(readyValidation.replaceAll("/", "\\/")))
  assert.ok(workflow.indexOf(readyValidation) < workflow.indexOf(readyPlaywright))
  assert.doesNotMatch(workflow, /HOME_SERVER_ENV|working-directory:\s*front|front\/yarn\.lock/)

  const liveSpec = readFileSync(path.resolve(import.meta.dirname, "../../e2e/live.spec.ts"), "utf8")
  assert.match(liveSpec, /Access-Control-Request-Headers": "content-type,x-aquila-csrf"/)
  assert.match(liveSpec, /access-control-allow-credentials"\]\)\.toBe\("true"\)/)
  assert.match(liveSpec, /access-control-allow-headers/)
  assert.match(liveSpec, /\.split\(","\)/)
  assert.match(liveSpec, /header\.trim\(\)\.toLowerCase\(\)/)
  assert.match(liveSpec, /allowedHeaders\)\.toContain\("x-aquila-csrf"\)/)
  assert.match(
    liveSpec,
    /image upload endpoint accepts the production Web CORS preflight[\s\S]*?const apiBaseUrl = resolveApiBaseUrl\(webOrigin\)[\s\S]*?new URL\("\/post\/api\/v1\/posts\/images", apiBaseUrl\)/
  )
  assert.match(liveSpec, /test\.skip\(!explicitLiveApiBaseUrl, "E2E_API_BASE_URL is required"\)/)
  assert.match(liveSpec, /test\.skip\(!expectedFrontendCommitSha, "E2E_EXPECTED_FRONT_COMMIT_SHA is required"\)/)
  assert.doesNotMatch(liveSpec, /x-xsrf-token/i)
})
