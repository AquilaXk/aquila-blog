import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const sqlPath = path.join(repoRoot, "deploy/homeserver/sql/task_payload_v1_inventory.sql")
const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml")
const executionInventoryPath = path.join(repoRoot, "tools/test/test-execution-inventory.json")

function readSql() {
  return readFileSync(sqlPath, "utf8")
}

function compactSql(sql) {
  return sql.replace(/\s+/g, " ").trim()
}

function statements(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
}

test("uses one bounded repeatable-read read-only transaction", () => {
  const sql = readSql()
  const transactionStatements = statements(sql)

  assert.equal(transactionStatements.length, 5)
  assert.match(transactionStatements[0], /^BEGIN\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+REPEATABLE\s+READ\s+READ\s+ONLY$/i)
  assert.match(transactionStatements[1], /^SET\s+LOCAL\s+statement_timeout\s*=\s*'30s'$/i)
  assert.match(transactionStatements[2], /^SET\s+LOCAL\s+lock_timeout\s*=\s*'5s'$/i)
  assert.match(transactionStatements[3], /^WITH\b[\s\S]*SELECT\s+current_setting\('transaction_read_only'\)::boolean\s+AS\s+read_only[\s\S]*AS\s+flat_v1_type_partition_ok$/i)
  assert.match(transactionStatements[4], /^ROLLBACK$/i)
  assert.doesNotMatch(sql, /\bCOMMIT\b/i)
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY)\b/i)
})

test("classifies JSON and v2 envelope shape without unsafe casts", () => {
  const sql = readSql()
  const compact = compactSql(sql)

  assert.match(compact, /CASE WHEN task\.payload IS NOT NULL AND pg_input_is_valid\(task\.payload, 'jsonb'\) THEN task\.payload::jsonb ELSE NULL END AS payload_doc/i)
  assert.match(compact, /pg_input_is_valid\(payload_doc ->> 'payloadJson', 'jsonb'\) THEN \(payload_doc ->> 'payloadJson'\)::jsonb ELSE NULL END AS body_doc/i)
  for (const payloadClass of ["invalid_json", "redacted", "schema_less", "flat_v1", "nested_v1", "valid_v2", "malformed_v2", "other_schema"]) {
    assert.match(sql, new RegExp(`'${payloadClass}'`))
  }
  assert.match(sql, /payload_doc\s*=\s*'\{"redacted":true\}'::jsonb/i)
  assert.match(sql, /jsonb_object_length\(payload_doc\)\s*=\s*6/i)
  assert.match(sql, /payload_doc\s+\?&\s+ARRAY\s*\[[\s\S]*'schemaVersion'[\s\S]*'payloadJson'[\s\S]*\]/i)
  assert.match(sql, /pg_input_is_valid\(payload_doc ->> 'createdAtEpochMs', 'bigint'\)/i)
  assert.match(sql, /pg_input_is_valid\(payload_doc ->> 'expiresAtEpochMs', 'bigint'\)/i)
})

test("emits one fixed aggregate row with exhaustive null-safe partitions", () => {
  const sql = readSql()
  const outputStart = sql.lastIndexOf("\nSELECT\n    current_setting")
  const outputSql = sql.slice(outputStart)

  assert.ok(outputStart > -1)

  for (const taskType of [
    "global.revalidate.home",
    "global.revalidate.post-cache-purge",
    "member.createActionLog",
    "post.hit.side-effect",
    "post.read.prewarm",
    "post.search-engine.mirror",
    "post.search-index.sync",
    "post.write.side-effect",
    "member.signupVerification.sendMail",
    "post.interaction.side-effect",
  ]) {
    assert.match(sql, new RegExp(`'${taskType.replaceAll(".", "\\.")}'`))
  }
  for (const status of ["PENDING", "PROCESSING", "FAILED", "COMPLETED", "QUARANTINED"]) {
    assert.match(sql, new RegExp(`'${status}'`))
  }
  assert.match(sql, /flat_v1_unknown_status_count/i)
  assert.match(sql, /status\s+IS\s+NULL\s+OR\s+status\s+NOT\s+IN/i)
  assert.match(sql, /flat_v1_unknown_type_count/i)
  assert.match(sql, /task_type\s+IS\s+NULL\s+OR/i)
  assert.match(sql, /payload_partition_ok/i)
  assert.match(sql, /flat_v1_status_partition_ok/i)
  assert.match(sql, /flat_v1_type_partition_ok/i)
  assert.doesNotMatch(sql, /\bGROUP\s+BY\b|\bUNION\b/i)
  assert.doesNotMatch(outputSql, /\bSELECT\s+(?:task\.)?(?:uid|aggregate_id|payload)\b/i)
})

test("runs the contract directly in Platform standalone CI", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const inventory = JSON.parse(readFileSync(executionInventoryPath, "utf8"))

  assert.match(
    workflow,
    /- name: Verify task payload v1 inventory contract\s+run: node --test tools\/test\/task-payload-v1-inventory\.test\.mjs/,
  )
  assert.deepEqual(
    inventory.entries.find(({ path: entryPath }) => entryPath === "tools/test/task-payload-v1-inventory.test.mjs"),
    {
      path: "tools/test/task-payload-v1-inventory.test.mjs",
      kind: "direct-ci",
      workflow: ".github/workflows/ci.yml",
      job: "platform-standalone",
      step: "Verify task payload v1 inventory contract",
    },
  )
})
