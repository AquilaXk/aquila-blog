import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const sqlPath = path.resolve(
  import.meta.dirname,
  "../../deploy/homeserver/sql/post_account_deletion_event_drain_inventory.sql",
)
const eventType = "com.back.boundedContexts.post.event.PostAccountDeletionDeletedEvent"
const expectedLabels = [
  "post_account_deletion_event_pending_count",
  "post_account_deletion_event_processing_count",
  "post_account_deletion_event_failed_count",
]
const v1Decoder = `            WHEN jsonb_typeof(c.payload_document -> 'schemaVersion') = 'number'
              AND c.payload_document ->> 'schemaVersion' = '1'
              AND NOT (c.payload_document ? 'payloadJson')
                THEN c.payload_document ->> 'domainEventType'`
const v2Decoder = `            WHEN jsonb_typeof(c.payload_document -> 'schemaVersion') = 'number'
              AND c.payload_document ->> 'schemaVersion' = '2'
              AND jsonb_typeof(c.payload_document -> 'payloadJson') = 'string'
                THEN ((c.payload_document ->> 'payloadJson')::jsonb)
                    ->> 'domainEventType'`

function readSql() {
  return readFileSync(sqlPath, "utf8")
}

function statements(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function validateSafeSql(sql) {
  const errors = []
  const transactionStatements = statements(sql)
  const query = transactionStatements[3] ?? ""
  const compact = query.replace(/\s+/g, " ")
  const withoutCounts = sql.replace(/COUNT\s*\(\s*\*\s*\)/gi, "COUNT_ROWS")

  if (transactionStatements.length !== 5) errors.push("statement count")
  if (!/^BEGIN\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+REPEATABLE\s+READ\s+READ\s+ONLY$/i.test(transactionStatements[0] ?? "")) errors.push("transaction")
  if (!/^SET\s+LOCAL\s+statement_timeout\s*=\s*'30s'$/i.test(transactionStatements[1] ?? "")) errors.push("statement timeout")
  if (!/^SET\s+LOCAL\s+lock_timeout\s*=\s*'5s'$/i.test(transactionStatements[2] ?? "")) errors.push("lock timeout")
  if (!/^ROLLBACK$/i.test(transactionStatements[4] ?? "")) errors.push("rollback")
  if (/\b(?:COMMIT|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY)\b/i.test(sql)) errors.push("mutation")
  if (/\bSELECT\s+INTO\b/i.test(sql) || /^\s*\\/m.test(sql)) errors.push("export or meta-command")
  if (/(?:\bSELECT|,)\s+\*/i.test(withoutCounts) || /\b\w+\.\*/i.test(withoutCounts)) errors.push("wildcard projection")
  if (!/candidate_payloads\s+AS\s+MATERIALIZED\s*\([\s\S]*t\.payload::jsonb\s+AS\s+payload_document/i.test(query)) errors.push("materialized payload parse")
  if (!/t\.task_type\s*=\s*'post\.write\.side-effect'/i.test(query)) errors.push("task type")
  if (!/t\.status\s+IN\s*\(\s*'PENDING'\s*,\s*'PROCESSING'\s*,\s*'FAILED'\s*\)/i.test(query)) errors.push("status scope")
  if (/\bnext_retry_at\b|\bCOMPLETED\b|\bQUARANTINED\b/i.test(query)) errors.push("status drift")
  if (!/schemaVersion'\)\s*=\s*'number'[\s\S]*schemaVersion'\s*=\s*'1'[\s\S]*NOT\s*\(\s*c\.payload_document\s*\?\s*'payloadJson'\s*\)[\s\S]*c\.payload_document\s*->>\s*'domainEventType'/i.test(query)) errors.push("v1 envelope")
  if (!/schemaVersion'\)\s*=\s*'number'[\s\S]*schemaVersion'\s*=\s*'2'[\s\S]*payloadJson'\)\s*=\s*'string'[\s\S]*\(\(c\.payload_document\s*->>\s*'payloadJson'\)::jsonb\)[\s\S]*->>\s*'domainEventType'/i.test(query)) errors.push("v2 envelope")
  if ((query.match(new RegExp(`=\\s*'${eventType.replaceAll(".", "\\.")}'`, "g")) ?? []).length !== 1) errors.push("event type equality")
  if (/\b(?:LIKE|ILIKE|SIMILAR\s+TO|substring)\b|[!~]=?|~\*/i.test(query)) errors.push("fuzzy matching")
  if ((query.match(/COUNT\s*\(\s*\*\s*\)::bigint/gi) ?? []).length !== 1) errors.push("aggregate count")
  if (!/^WITH\b[\s\S]*SELECT\s+inventory_output\.label,\s*inventory_output\.count\s+FROM\s+inventory_output\s+ORDER\s+BY\s+inventory_output\.ordinal$/i.test(query)) errors.push("outer projection")

  const labels = [...sql.matchAll(/'(post_account_deletion_event_[a-z_]+)'/g)].map((match) => match[1])
  if (labels.length !== expectedLabels.length || labels.some((label, index) => label !== expectedLabels[index])) errors.push("labels")

  return errors
}

function validateRows(rows) {
  assert.deepEqual(
    rows.map(({ label }) => label),
    expectedLabels,
  )
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ["count", "label"])
    assert.equal(typeof row.count, "bigint")
    assert.ok(row.count >= 0n)
  }
}

test("uses one bounded repeatable-read read-only transaction", () => {
  assert.deepEqual(validateSafeSql(readSql()), [])
})

test("decodes both supported envelopes and emits only ordered aggregates", () => {
  const sql = readSql()

  assert.equal((sql.match(new RegExp(eventType.replaceAll(".", "\\."), "g")) ?? []).length, 1)
  assert.match(sql, /schemaVersion[\s\S]*payloadJson[\s\S]*domainEventType/i)
  assert.match(sql, /SELECT\s+inventory_output\.label,\s*inventory_output\.count\s+FROM\s+inventory_output\s+ORDER\s+BY\s+inventory_output\.ordinal/i)
})

test("rejects contract weakening and data exposure", () => {
  const valid = readSql()

  for (const [name, unsafe] of [
    ["commit", valid.replace(/ROLLBACK/i, "COMMIT")],
    ["dml", `${valid}\nDELETE FROM task;`],
    ["v1 removed", valid.replace(v1Decoder, "            WHEN FALSE THEN NULL")],
    ["v2 removed", valid.replace(v2Decoder, "            WHEN FALSE THEN NULL")],
    ["legacy payload field", valid.replaceAll("payloadJson", "domainEventJson")],
    ["fuzzy event match", valid.replace("d.domain_event_type =", "d.domain_event_type LIKE")],
    ["broader statuses", valid.replace("'FAILED'", "'FAILED', 'COMPLETED'")],
    ["broader task type", valid.replace("t.task_type =", "t.task_type LIKE")],
    ["event drift", valid.replace(eventType, `${eventType}V2`)],
    ["materialization removed", valid.replace("AS MATERIALIZED", "AS")],
    ["outer data exposure", valid.replace("inventory_output.count", "decoded_candidates.domain_event_type, inventory_output.count")],
  ]) {
    assert.notDeepEqual(validateSafeSql(unsafe), [], name)
  }
})

test("rejects malformed aggregate output", () => {
  validateRows(expectedLabels.map((label) => ({ label, count: 0n })))

  for (const rows of [
    expectedLabels.slice(0, 2).map((label) => ({ label, count: 0n })),
    [...expectedLabels].reverse().map((label) => ({ label, count: 0n })),
    expectedLabels.map((label) => ({ label, count: -1n })),
    expectedLabels.map((label) => ({ label, count: "0" })),
    expectedLabels.map((label) => ({ label, count: 0n, taskId: 1n })),
  ]) {
    assert.throws(() => validateRows(rows))
  }
})
