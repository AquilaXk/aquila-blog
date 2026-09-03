import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const sqlPath = path.join(repoRoot, "deploy/homeserver/sql/profile_workspace_canonical_inventory.sql")
const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml")
const backendWorkflowPath = path.join(repoRoot, ".github/workflows/reusable-backend-quality.yml")
const executionInventoryPath = path.join(repoRoot, "tools/test/test-execution-inventory.json")

function statements(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
}

test("uses one bounded aggregate-only transaction", () => {
  const sql = readFileSync(sqlPath, "utf8")
  const transactionStatements = statements(sql)

  assert.equal(transactionStatements.length, 5)
  assert.match(transactionStatements[0], /^BEGIN\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+REPEATABLE\s+READ\s+READ\s+ONLY$/i)
  assert.match(transactionStatements[1], /^SET\s+LOCAL\s+statement_timeout\s*=\s*'30s'$/i)
  assert.match(transactionStatements[2], /^SET\s+LOCAL\s+lock_timeout\s*=\s*'5s'$/i)
  assert.match(transactionStatements[3], /^WITH\b[\s\S]*SELECT\s+current_setting\('transaction_read_only'\)::boolean\s+AS\s+read_only/i)
  assert.match(transactionStatements[4], /^ROLLBACK$/i)
  assert.doesNotMatch(sql, /\bCOMMIT\b|\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY)\b/i)
})

test("classifies canonical snapshots and legacy projection without raw output", () => {
  const sql = readFileSync(sqlPath, "utf8")
  const outputStart = sql.lastIndexOf("\nSELECT\n    current_setting")
  const outputSql = sql.slice(outputStart)

  assert.ok(outputStart > -1)
  for (const field of [
    "draft_missing_count",
    "draft_invalid_count",
    "draft_noncanonical_count",
    "published_missing_count",
    "published_invalid_count",
    "published_noncanonical_count",
    "legacy_workspace_mismatch_count",
    "lifecycle_partition_ok",
    "draft_partition_ok",
    "published_partition_ok",
  ]) {
    assert.match(outputSql, new RegExp(`\\b${field}\\b`, "i"))
  }
  assert.doesNotMatch(outputSql, /\bAS\s+(?:member_)?id\b|\bAS\s+(?:draft|published)_raw\b/i)
})

test("runs the contract directly in Platform CI", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const backendWorkflow = readFileSync(backendWorkflowPath, "utf8")
  const inventory = JSON.parse(readFileSync(executionInventoryPath, "utf8"))

  assert.match(
    workflow,
    /- name: Verify profile workspace canonical inventory contract\s+run: node --test tools\/test\/profile-workspace-canonical-inventory\.test\.mjs/,
  )
  assert.deepEqual(
    inventory.entries.find(({ path: entryPath }) => entryPath === "tools/test/profile-workspace-canonical-inventory.test.mjs"),
    {
      path: "tools/test/profile-workspace-canonical-inventory.test.mjs",
      kind: "direct-ci",
      workflow: ".github/workflows/ci.yml",
      job: "platform-standalone",
      step: "Verify profile workspace canonical inventory contract",
    },
  )
  assert.match(
    backendWorkflow,
    /- name: Run selected PostgreSQL contract regression gates[\s\S]*--tests com\.back\.infrastructure\.ProfileWorkspaceCanonicalInventoryTestcontainersIntegrationTest/,
  )
})
