import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const sqlPath = path.join(repoRoot, "deploy/homeserver/sql/temporary_draft_title_inventory.sql")
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

test("partitions marker and legacy title state without raw output", () => {
  const sql = readFileSync(sqlPath, "utf8")
  const outputStart = sql.lastIndexOf("\nSELECT\n    current_setting")
  const outputSql = sql.slice(outputStart)

  assert.ok(outputStart > -1)
  for (const field of [
    "invalid_nonblank_marker_count",
    "untracked_legacy_title_candidate_count",
    "untracked_legacy_author_count",
    "ambiguous_untracked_author_count",
    "untracked_author_with_active_marker_count",
    "legacy_title_listed_count",
    "canonical_listed_count",
    "marker_partition_ok",
    "legacy_partition_ok",
  ]) {
    assert.match(outputSql, new RegExp(`\\b${field}\\b`, "i"))
  }
  assert.doesNotMatch(outputSql, /\bAS\s+(?:post|author|subject)_id\b|\bAS\s+marker_value\b/i)
})

test("runs the contract directly in Platform CI", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const backendWorkflow = readFileSync(backendWorkflowPath, "utf8")
  const inventory = JSON.parse(readFileSync(executionInventoryPath, "utf8"))

  assert.match(
    workflow,
    /- name: Verify temporary draft title inventory contract\s+run: node --test tools\/test\/temporary-draft-title-inventory\.test\.mjs/,
  )
  assert.deepEqual(
    inventory.entries.find(({ path: entryPath }) => entryPath === "tools/test/temporary-draft-title-inventory.test.mjs"),
    {
      path: "tools/test/temporary-draft-title-inventory.test.mjs",
      kind: "direct-ci",
      workflow: ".github/workflows/ci.yml",
      job: "platform-standalone",
      step: "Verify temporary draft title inventory contract",
    },
  )
  assert.match(
    backendWorkflow,
    /- name: Run selected PostgreSQL contract regression gates[\s\S]*--tests com\.back\.infrastructure\.TemporaryDraftTitleInventoryTestcontainersIntegrationTest/,
  )
})
