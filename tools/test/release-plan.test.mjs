import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const scriptPath = path.join(repoRoot, "tools/ci/classify-release.mjs")
const backendWorkflowPath = path.join(repoRoot, ".github/workflows/reusable-backend-quality.yml")
const nMinusOneTestPath = path.join(
  repoRoot,
  "back/src/test/kotlin/com/back/infrastructure/FlywayNMinusOneCompatibilityTestcontainersIntegrationTest.kt",
)

const migrationSafetyReport = (overrides = {}) => ({
  version: 2,
  ok: true,
  blocked: false,
  checkedFiles: [],
  findings: [],
  classifications: [],
  runNMinusOne: false,
  frameworkChanged: false,
  ...overrides,
})

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
  assert.equal("verifyFrontend" in result.json, false)
  assert.deepEqual(result.json.reasons, ["docs-only"])
})

test("Platform classifier ignores Web-owned paths", () => {
  const backend = runClassifier(["back/src/main/kotlin/com/back/PostController.kt"])
  const frontend = runClassifier(["front/src/pages/index.tsx"])

  assert.equal(backend.status, 0, backend.stderr)
  assert.equal(backend.json.changeScope, "backend-only")
  assert.equal(backend.json.riskProfile, "standard")
  assert.equal(backend.json.deployBackend, true)
  assert.equal("verifyFrontend" in backend.json, false)

  assert.equal(frontend.status, 0, frontend.stderr)
  assert.equal(frontend.json.changeScope, "non-platform")
  assert.equal(frontend.json.riskProfile, "standard")
  assert.equal(frontend.json.deployBackend, false)
  assert.equal("verifyFrontend" in frontend.json, false)
  assert.deepEqual(frontend.json.reasons, [])
})

test("privacy restore gate remains backend deploy-owned", () => {
  const result = runClassifier(["restore-privacy-gate.sh"])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.json.changeScope, "backend-only")
  assert.equal(result.json.deployBackend, true)
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
  assert.equal(result.json.changeScope, "non-platform")
  assert.equal(result.json.riskProfile, "standard")
  assert(!result.json.reasons.includes("security-or-auth"))
})

test("Web paths do not change a backend release classification", () => {
  const result = runClassifier([
    "back/src/main/kotlin/com/back/PostController.kt",
    "front/src/pages/index.tsx",
  ])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.json.changeScope, "backend-only")
  assert.equal(result.json.riskProfile, "standard")
  assert.equal(result.json.deployBackend, true)
  assert.equal("verifyFrontend" in result.json, false)
  assert(!result.json.reasons.includes("frontend"))
})

test("destructive migration safety result blocks release", () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "release-plan-"))
  const safetyPath = path.join(workDir, "migration-safety.json")

  try {
    writeFileSync(
      safetyPath,
      JSON.stringify(migrationSafetyReport({
        ok: false,
        blocked: true,
        findings: [{ file: "back/src/main/resources/db/migration/V20260619_99__drop_table.sql", rule: "drop-table" }],
      })),
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

test("migration compatibility report routes the representative N-1 lane", () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "release-plan-"))
  const safetyPath = path.join(workDir, "migration-safety.json")

  try {
    writeFileSync(
      safetyPath,
      JSON.stringify(migrationSafetyReport({
        runNMinusOne: true,
      })),
    )

    const result = runClassifier(
      ["back/src/main/resources/db/migration/V20260619_18__requires_n_minus_1.sql"],
      ["--migration-safety-json", safetyPath],
    )

    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.json.riskProfile, "extended")
    assert.equal(result.json.runNMinusOne, true)
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("invalid migration safety report fails closed", () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "release-plan-"))
  const safetyPath = path.join(workDir, "migration-safety.json")

  try {
    writeFileSync(safetyPath, JSON.stringify({}))
    const result = runClassifier(["back/src/main/kotlin/com/back/PostController.kt"], [
      "--migration-safety-json",
      safetyPath,
    ])

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /invalid migration safety report/i)
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("Platform reusable workflow runs release planner and strict boundary checks", () => {
  const backendWorkflow = readFileSync(backendWorkflowPath, "utf8")
  const nMinusOneTest = readFileSync(nMinusOneTestPath, "utf8")
  const backendDetection = backendWorkflow.match(/case "\$\{file\}" in([\s\S]*?)esac/)?.[1] ?? ""

  assert.match(backendWorkflow, /Check Flyway deploy safety/)
  assert.match(backendWorkflow, /previous_filename/)
  assert.match(backendWorkflow, /tools\/ci\/check-flyway-deploy-safety\.mjs/)
  assert.match(backendWorkflow, /Classify release risk/)
  assert.match(backendWorkflow, /tools\/ci\/classify-release\.mjs/)
  assert.match(backendWorkflow, /--migration-safety-json "\$\{RUNNER_TEMP\}\/flyway-deploy-safety\.json"/)
  assert.match(backendWorkflow, /--policy "\$\{policy_path\}"[\s\S]*--base-policy "\$\{base_policy\}"[\s\S]*Run Flyway N-1 compatibility test[\s\S]*\.\/gradlew testcontainersTest --tests com\.back\.infrastructure\.FlywayNMinusOneCompatibilityTestcontainersIntegrationTest --rerun-tasks/)
  assert.match(backendWorkflow, /steps\.flyway_safety\.outputs\.status != '0'/)
  assert.match(backendDetection, /tools\/test\/flyway-deploy-safety\.test\.mjs/)
  assert.doesNotMatch(nMinusOneTest, /disabledWithoutDocker\s*=\s*true/)
  assert(backendWorkflow.indexOf("Check Flyway deploy safety") < backendWorkflow.indexOf("Classify release risk"))
  assert(backendWorkflow.indexOf("Classify release risk") < backendWorkflow.indexOf("Skip backend-heavy checks"))
  assert.match(backendWorkflow, /node --test tools\/test\/release-plan\.test\.mjs tools\/test\/flyway-deploy-safety\.test\.mjs/)
  assert.match(backendWorkflow, /node tools\/repo-boundary\/check-platform-boundary\.mjs/)
  assert.doesNotMatch(backendWorkflow, /--report-only|reusable-frontend-verify|front\/yarn\.lock/)
})

test("Platform reusable workflow paginates PR files without an unauthenticated fallback", () => {
  const backendWorkflow = readFileSync(backendWorkflowPath, "utf8")

  assert.equal(backendWorkflow.match(/^\s+page=1$/gm)?.length, 2)
  assert.equal(backendWorkflow.match(/page=\$\(\(page \+ 1\)\)/g)?.length, 2)
  assert.equal(backendWorkflow.match(/--connect-timeout 10/g)?.length, 2)
  assert.equal(backendWorkflow.match(/--max-time 30/g)?.length, 2)
  assert.doesNotMatch(backendWorkflow, /rel="next"|GitHub API token fallback|retrying without token/)
})
