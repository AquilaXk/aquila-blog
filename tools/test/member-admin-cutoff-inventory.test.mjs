import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const sqlPath = path.resolve(import.meta.dirname, "../../deploy/homeserver/sql/member_admin_cutoff_inventory.sql")
const expectedLabels = [
  "legacy_active_member_count",
  "legacy_active_session_count",
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
  const withoutRequiredJoins = withoutCounts
    .replace(/ms\.member_id\s*=\s*m\.id/gi, "")

  if (transactionStatements.length !== 5) errors.push("statement count")
  if (!/^BEGIN\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+REPEATABLE\s+READ\s+READ\s+ONLY$/i.test(transactionStatements[0] ?? "")) errors.push("transaction")
  if (!/^SET\s+LOCAL\s+statement_timeout\s*=\s*'30s'$/i.test(transactionStatements[1] ?? "")) errors.push("statement timeout")
  if (!/^SET\s+LOCAL\s+lock_timeout\s*=\s*'5s'$/i.test(transactionStatements[2] ?? "")) errors.push("lock timeout")
  if (!/^ROLLBACK$/i.test(transactionStatements[4] ?? "")) errors.push("rollback")
  if (/\b(?:COMMIT|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY)\b/i.test(sql)) errors.push("mutation")
  if (/\bSELECT\s+INTO\b/i.test(sql) || /^\s*\\/m.test(sql)) errors.push("export or meta-command")
  if (/(?:\bSELECT|,)\s+\*/i.test(withoutCounts) || /\b\w+\.\*/i.test(withoutCounts)) errors.push("wildcard projection")
  if ((sql.match(/COUNT\s*\(\s*\*\s*\)::bigint/gi) ?? []).length !== 2) errors.push("non-count output")
  if (/\b(?:email|login_id|password|api_key|session_key|token|hash|ip_address|user_agent|nickname|message|type)\b/i.test(sql)) errors.push("private field")
  if (/\b(?:m\.id|ms\.member_id)\b/i.test(withoutRequiredJoins)) errors.push("raw identifier")
  if (!/^WITH\b[\s\S]*SELECT\s+inventory_output\.label,\s*inventory_output\.count\s+FROM\s+inventory_output\s+ORDER\s+BY\s+inventory_output\.ordinal$/i.test(transactionStatements[3] ?? "")) errors.push("outer projection")

  const labels = [...sql.matchAll(/'(legacy_[a-z_]+)'/g)].map((match) => match[1])
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

test("emits only the two ordered administrator cutoff aggregates", () => {
  const sql = readSql().replace(/\s+/g, " ")

  assert.match(sql, /m\.is_admin IS FALSE AND m\.deleted_at IS NULL/i)
  assert.match(sql, /ms\.member_id = m\.id[\s\S]*ms\.revoked_at IS NULL/i)
  assert.match(sql, /SELECT inventory_output\.label, inventory_output\.count FROM inventory_output ORDER BY inventory_output\.ordinal/i)
  assert.equal((sql.match(/COUNT\(\*\)::bigint/gi) ?? []).length, 2)
})

test("rejects unsafe SQL contract drift", () => {
  const valid = readSql()

  for (const [name, unsafe] of [
    ["commit", valid.replace(/ROLLBACK/i, "COMMIT")],
    ["dml", `${valid}\nDELETE FROM member;`],
    ["ddl", valid.replace("WITH inventory_output", "CREATE TABLE leaked(id bigint);\nWITH inventory_output")],
    ["wildcard", valid.replace("COUNT(*)", "*")],
    ["outer projection", valid.replace("inventory_output.count", "inventory_output.ordinal, inventory_output.count")],
    ["raw identifier", valid.replace("m.is_admin", "m.id, m.is_admin")],
    ["label drift", valid.replace("legacy_active_member_count", "legacy_extra_count")],
    ["meta-command", `${valid}\n\\copy member TO 'members.csv'`],
  ]) {
    assert.notDeepEqual(validateSafeSql(unsafe), [], name)
  }
})

test("rejects malformed aggregate output", () => {
  validateRows(expectedLabels.map((label) => ({ label, count: 0n })))

  for (const rows of [
    expectedLabels.slice(0, 1).map((label) => ({ label, count: 0n })),
    expectedLabels.map((label) => ({ label, count: -1n })),
    expectedLabels.map((label) => ({ label, count: "0" })),
    expectedLabels.map((label) => ({ label, count: 0n, id: 1 })),
  ]) {
    assert.throws(() => validateRows(rows))
  }
})
