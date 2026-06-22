import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const validatorPath = path.join(repoRoot, "tools/legal/validate-legal-policies.mjs")
const sourcePoliciesDir = path.join(repoRoot, "legal/policies")
const sourceFrontendMetadataPath = path.join(repoRoot, "front/src/apis/backend/legal.ts")
const sourceBackendMetadataPath = path.join(
  repoRoot,
  "back/src/main/kotlin/com/back/boundedContexts/member/subContexts/legalAcceptance/application/service/ActiveLegalDocumentMetadata.kt",
)

const runValidator = (fixtureRoot) =>
  spawnSync(process.execPath, [validatorPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LEGAL_POLICIES_DIR: path.join(fixtureRoot, "policies"),
      LEGAL_FRONTEND_METADATA_PATH: path.join(fixtureRoot, "frontend-legal.ts"),
      LEGAL_BACKEND_METADATA_PATH: path.join(fixtureRoot, "ActiveLegalDocumentMetadata.kt"),
    },
    encoding: "utf8",
  })

const createFixture = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "legal-policy-validator-"))
  const policiesDir = path.join(fixtureRoot, "policies")
  fs.mkdirSync(policiesDir, { recursive: true })

  for (const fileName of fs.readdirSync(sourcePoliciesDir)) {
    if (fileName.endsWith(".yaml")) {
      fs.copyFileSync(path.join(sourcePoliciesDir, fileName), path.join(policiesDir, fileName))
    }
  }
  fs.copyFileSync(sourceFrontendMetadataPath, path.join(fixtureRoot, "frontend-legal.ts"))
  fs.copyFileSync(sourceBackendMetadataPath, path.join(fixtureRoot, "ActiveLegalDocumentMetadata.kt"))
  return fixtureRoot
}

const rewritePolicy = (fixtureRoot, fileName, mutate) => {
  const filePath = path.join(fixtureRoot, "policies", fileName)
  const policy = JSON.parse(fs.readFileSync(filePath, "utf8"))
  mutate(policy)
  policy.contentSha256 = ""
  policy.contentSha256 = execFileSync(
    process.execPath,
    [
      "-e",
      [
        "const crypto = require('node:crypto');",
        "const policy = JSON.parse(process.argv[1]);",
        "const normalized = { ...policy, contentSha256: '' };",
        "process.stdout.write(crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex'));",
      ].join(""),
      JSON.stringify(policy),
    ],
    { encoding: "utf8" },
  )
  fs.writeFileSync(filePath, `${JSON.stringify(policy, null, 2)}\n`)
}

test("validator fixture fails when an effective policy exposes reviewRequired", () => {
  const fixtureRoot = createFixture()
  rewritePolicy(fixtureRoot, "privacy.ko-KR.v1.0.1.yaml", (policy) => {
    policy.reviewRequired = ["출시 gate 내부 확인"]
  })

  const result = runValidator(fixtureRoot)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /public policy must not contain reviewRequired/)
})

test("validator fixture fails when frontend active legal hash drifts from policy source", () => {
  const fixtureRoot = createFixture()
  const frontendPath = path.join(fixtureRoot, "frontend-legal.ts")
  const source = fs.readFileSync(frontendPath, "utf8")
  fs.writeFileSync(frontendPath, source.replace(/contentSha256: "[a-f0-9]{64}"/, `contentSha256: "${"0".repeat(64)}"`))

  const result = runValidator(fixtureRoot)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /frontend active legal metadata terms contentSha256 mismatch/)
})
