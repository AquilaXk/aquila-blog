import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const sqlPath = path.resolve(import.meta.dirname, "../../deploy/homeserver/sql/member_privacy_email_eligibility_inventory.sql")
const expectedLabels = [
  "legacy_active_member_email_missing_count",
  "legacy_active_member_email_blank_count",
  "legacy_active_member_email_normalization_collision_count",
  "legacy_active_member_email_ineligible_count",
]

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
  const withoutCounts = sql.replace(/COUNT\s*\(\s*\*\s*\)/gi, "COUNT_ROWS")

  if (transactionStatements.length !== 5) errors.push("statement count")
  if (!/^BEGIN\s+ISOLATION\s+LEVEL\s+REPEATABLE\s+READ\s+READ\s+ONLY$/i.test(transactionStatements[0] ?? "")) errors.push("transaction")
  if (!/^SET\s+LOCAL\s+statement_timeout\s*=\s*'30s'$/i.test(transactionStatements[1] ?? "")) errors.push("statement timeout")
  if (!/^SET\s+LOCAL\s+lock_timeout\s*=\s*'5s'$/i.test(transactionStatements[2] ?? "")) errors.push("lock timeout")
  if (!/^ROLLBACK$/i.test(transactionStatements[4] ?? "")) errors.push("rollback")
  if (/\b(?:COMMIT|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY)\b/i.test(sql)) errors.push("mutation")
  if (/\bSELECT\s+INTO\b/i.test(sql) || /^\s*\\/m.test(sql)) errors.push("export or meta-command")
  if (/(?:\bSELECT|,)\s+\*/i.test(withoutCounts) || /\b\w+\.\*/i.test(withoutCounts)) errors.push("wildcard projection")
  if ((sql.match(/COUNT\s*\(\s*\*\s*\)::bigint/gi) ?? []).length !== 4) errors.push("non-count output")
  if (!/^WITH\b[\s\S]*SELECT\s+inventory_output\.label,\s*inventory_output\.count\s+FROM\s+inventory_output\s+ORDER\s+BY\s+inventory_output\.ordinal$/i.test(transactionStatements[3] ?? "")) errors.push("outer projection")

  const labels = [...sql.matchAll(/'(legacy_active_member_email_[a-z_]+)'/g)].map((match) => match[1])
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

test("counts legacy active member email eligibility without exposing source values", () => {
  const sql = readSql().replace(/\s+/g, " ")
  const normalizedCounts = sql.match(/normalized_email_counts AS \((.*?)\), inventory_output AS/s)?.[1]

  assert.match(sql, /m\.is_admin IS FALSE AND m\.deleted_at IS NULL/i)
  assert.ok(normalizedCounts)
  assert.match(normalizedCounts, /m\.deleted_at IS NULL/i)
  assert.doesNotMatch(normalizedCounts, /m\.is_admin/i)
  assert.match(sql, /m\.email IS NULL/i)
  assert.match(sql, /m\.email IS NOT NULL AND btrim\(m\.email\) = ''/i)
  assert.match(sql, /lower\(btrim\(m\.email\)\)/i)
  assert.match(sql, /char_length\(m\.email\) > 320/i)
  assert.match(sql, /m\.email IS DISTINCT FROM lower\(btrim\(m\.email\)\)/i)
  assert.match(sql, /normalized_email_counts\.row_count > 1/i)
  assert.match(sql, /btrim\(m\.email\) !~ '\^\[A-Za-z0-9\.\!#\$%&''\*\+\/=\?\^_`\{\|\}~-\]\+@/i)
  assert.match(sql, /SELECT inventory_output\.label, inventory_output\.count FROM inventory_output ORDER BY inventory_output\.ordinal/i)
  assert.equal((sql.match(/COUNT\(\*\)::bigint/gi) ?? []).length, 4)
})

test("rejects unsafe SQL contract drift", () => {
  const valid = readSql()

  for (const [name, unsafe] of [
    ["commit", valid.replace(/ROLLBACK/i, "COMMIT")],
    ["dml", `${valid}\nDELETE FROM member;`],
    ["ddl", valid.replace("WITH active_legacy_member_emails", "CREATE TABLE leaked(id bigint);\nWITH active_legacy_member_emails")],
    ["wildcard", valid.replace("COUNT(*)", "*")],
    ["outer projection", valid.replace("inventory_output.count", "inventory_output.ordinal, inventory_output.count")],
    ["raw email projection", valid.replace("inventory_output.count", "m.email, inventory_output.count")],
    ["label drift", valid.replace("legacy_active_member_email_missing_count", "legacy_active_member_email_extra_count")],
    ["meta-command", `${valid}\n\\copy member TO 'members.csv'`],
    ["timeout drift", valid.replace("'30s'", "'31s'")],
  ]) {
    assert.notDeepEqual(validateSafeSql(unsafe), [], name)
  }
})

test("rejects malformed aggregate output", () => {
  validateRows(expectedLabels.map((label) => ({ label, count: 0n })))

  for (const rows of [
    expectedLabels.slice(0, 3).map((label) => ({ label, count: 0n })),
    expectedLabels.map((label) => ({ label, count: -1n })),
    expectedLabels.map((label) => ({ label, count: "0" })),
    expectedLabels.map((label) => ({ label, count: 0n, email: "private@example.com" })),
  ]) {
    assert.throws(() => validateRows(rows))
  }
})
