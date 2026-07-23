import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const scriptPath = path.join(repoRoot, "tools/ci/classify-release.mjs")
const backendWorkflowPath = path.join(repoRoot, ".github/workflows/reusable-backend-quality.yml")
const frontendWorkflowPath = path.join(repoRoot, ".github/workflows/reusable-frontend-verify.yml")

const runClassifier = (files, args = []) => {
  const result = spawnSync(process.execPath, [scriptPath, "--json", ...args], {
    cwd: repoRoot,
    input: `${files.join("\n")}\n`,
    encoding: "utf8",
  })

  return {
    ...result,
    json: result.stdout ? JSON.parse(result.stdout) : null,
  }
}

test("docs-only changes stay standard and skip deploy verifications", () => {
  const result = runClassifier(["docs/agent/infra-oauth.md"])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.json.changeScope, "docs-only")
  assert.equal(result.json.riskProfile, "standard")
  assert.equal(result.json.deployBackend, false)
  assert.equal(result.json.verifyFrontend, false)
  assert.deepEqual(result.json.reasons, ["docs-only"])
})

test("backend-only and frontend-only changes keep independent standard routing", () => {
  const backend = runClassifier(["back/src/main/kotlin/com/back/PostController.kt"])
  const frontend = runClassifier(["front/src/pages/index.tsx"])
  const legalPolicy = runClassifier(["legal/policies/privacy.ko-KR.v1.0.1.yaml"])

  assert.equal(backend.status, 0, backend.stderr)
  assert.equal(backend.json.changeScope, "backend-only")
  assert.equal(backend.json.riskProfile, "standard")
  assert.equal(backend.json.deployBackend, true)
  assert.equal(backend.json.verifyFrontend, false)

  assert.equal(frontend.status, 0, frontend.stderr)
  assert.equal(frontend.json.changeScope, "frontend-only")
  assert.equal(frontend.json.riskProfile, "standard")
  assert.equal(frontend.json.deployBackend, false)
  assert.equal(frontend.json.verifyFrontend, true)

  assert.equal(legalPolicy.status, 0, legalPolicy.stderr)
  assert.equal(legalPolicy.json.changeScope, "frontend-only")
  assert.equal(legalPolicy.json.riskProfile, "standard")
  assert.equal(legalPolicy.json.deployBackend, false)
  assert.equal(legalPolicy.json.verifyFrontend, true)
  assert(legalPolicy.json.reasons.includes("frontend"))
})

test("security deploy storage task migration workflow and dockerfile changes are extended", () => {
  const cases = [
    "back/src/main/kotlin/com/back/global/security/AuthPolicy.kt",
    "back/src/main/kotlin/com/back/global/AuthorizationFilter.kt",
    "back/src/main/kotlin/com/back/global/oauth/OAuthService.kt",
    "back/src/main/kotlin/com/back/global/session/SessionCookie.kt",
    "back/src/main/kotlin/com/back/boundedContexts/upload/StorageService.kt",
    "back/src/main/kotlin/com/back/boundedContexts/task/TaskWorker.kt",
    "deploy/homeserver/docker-compose.prod.yml",
    "back/src/main/resources/db/migration/V20260619_03__add_safe_column.sql",
    ".github/workflows/reusable-backend-quality.yml",
    "back/Dockerfile",
  ]

  for (const file of cases) {
    const result = runClassifier([file])
    assert.equal(result.status, 0, `${file}\n${result.stderr}`)
    assert.equal(result.json.riskProfile, "extended", file)
    assert(result.json.reasons.length > 0, file)
  }
})

test("authoring paths do not count as auth risk", () => {
  const result = runClassifier(["front/e2e/editor-authoring-flow.spec.ts"])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.json.changeScope, "frontend-only")
  assert.equal(result.json.riskProfile, "standard")
  assert(!result.json.reasons.includes("security-or-auth"))
})

test("backend and frontend together are mixed extended", () => {
  const result = runClassifier([
    "back/src/main/kotlin/com/back/PostController.kt",
    "front/src/pages/index.tsx",
  ])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.json.changeScope, "mixed")
  assert.equal(result.json.riskProfile, "extended")
  assert.equal(result.json.deployBackend, true)
  assert.equal(result.json.verifyFrontend, true)
  assert(result.json.reasons.includes("backend-and-frontend"))
})

test("destructive migration safety result blocks release", () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "release-plan-"))
  const safetyPath = path.join(workDir, "migration-safety.json")

  try {
    writeFileSync(
      safetyPath,
      JSON.stringify({
        ok: false,
        blocked: true,
        findings: [{ file: "back/src/main/resources/db/migration/V20260619_99__drop_table.sql", rule: "drop-table" }],
      }),
    )

    const result = runClassifier(
      ["back/src/main/resources/db/migration/V20260619_99__drop_table.sql"],
      ["--migration-safety-json", safetyPath],
    )

    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.json.changeScope, "backend-only")
    assert.equal(result.json.riskProfile, "blocked")
    assert(result.json.reasons.includes("destructive-migration"))
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("reusable workflows run release planner policy checks", () => {
  const backendWorkflow = readFileSync(backendWorkflowPath, "utf8")
  const frontendWorkflow = readFileSync(frontendWorkflowPath, "utf8")

  assert.match(backendWorkflow, /Check Flyway deploy safety/)
  assert.match(backendWorkflow, /previous_filename/)
  assert.match(backendWorkflow, /tools\/ci\/check-flyway-deploy-safety\.mjs/)
  assert.match(backendWorkflow, /Classify release risk/)
  assert.match(backendWorkflow, /tools\/ci\/classify-release\.mjs/)
  assert.match(backendWorkflow, /--migration-safety-json "\$\{RUNNER_TEMP\}\/flyway-deploy-safety\.json"/)
  assert(backendWorkflow.indexOf("Check Flyway deploy safety") < backendWorkflow.indexOf("Classify release risk"))
  assert(backendWorkflow.indexOf("Classify release risk") < backendWorkflow.indexOf("Skip backend-heavy checks"))
  assert.match(backendWorkflow, /node --test tools\/test\/release-plan\.test\.mjs tools\/test\/flyway-deploy-safety\.test\.mjs/)

  assert.match(frontendWorkflow, /Classify release risk/)
  assert.match(frontendWorkflow, /previous_filename/)
  assert.match(frontendWorkflow, /legal\/policies\/\*/)
  assert.match(frontendWorkflow, /tools\/ci\/classify-release\.mjs/)
  assert(frontendWorkflow.indexOf("Classify release risk") < frontendWorkflow.indexOf("Skip frontend-heavy checks"))
})
