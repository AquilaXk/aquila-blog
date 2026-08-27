import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const sqlPath = path.resolve(import.meta.dirname, "../../deploy/homeserver/sql/content_html_trust_inventory.sql")

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
  assert.match(transactionStatements[3], /^WITH\b[\s\S]*SELECT\s+inventory_output\.label,\s*inventory_output\.count[\s\S]*ORDER\s+BY\s+inventory_output\.label$/i)
  assert.match(transactionStatements[4], /^ROLLBACK$/i)
  assert.match(sql, /ROLLBACK\s*;\s*$/i)
  assert.doesNotMatch(sql, /\bCOMMIT\b/i)
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY)\b/i)
})

test("matches JavaScript trim presence and exact trust metadata buckets", () => {
  const sql = readSql()

  for (const codePoint of ["9", "10", "11", "12", "13", "32", "160", "5760", "8192", "8193", "8194", "8195", "8196", "8197", "8198", "8199", "8200", "8201", "8202", "8232", "8233", "8239", "8287", "12288", "65279"]) {
    assert.match(sql, new RegExp(`chr\\(${codePoint}\\)`))
  }
  assert.match(sql, /btrim\(p\.content,\s*c\.js_trim_chars\)\s*<>\s*''/i)
  assert.match(sql, /btrim\(p\.content_html,\s*c\.js_trim_chars\)\s*<>\s*''/i)
  assert.match(
    sql,
    /p\.content_html\s+IS\s+NULL\s+OR\s+btrim\(p\.content_html,\s*c\.js_trim_chars\)\s*=\s*''/i,
  )
  for (const label of ["active", "soft_deleted", "markdown_present", "markdown_absent", "html_present", "html_absent", "TRUSTED_CURRENT", "UNKNOWN", "REJECTED", "null", "other", "content-html-v1", "other_nonblank", "null_or_blank", "not_applicable", "missing", "malformed", "valid", "mismatched"]) {
    assert.match(sql, new RegExp(`'${label}'`))
  }
  assert.match(sql, /encode\(sha256\(convert_to\(p\.content_html,\s*'UTF8'\)\),\s*'hex'\)/i)
  assert.match(sql, /\^\[0-9a-f\]\{64\}\$/)
})

test("emits aggregate-only exact decision totals and fails closed on partition drift", () => {
  const sql = readSql()
  const compact = compactSql(sql)

  for (const label of ["total_rows", "trusted_html_only", "revalidation_candidate", "source_missing", "transition_blocker", "non_blocker"]) {
    assert.match(sql, new RegExp(label))
  }
  assert.match(compact, /markdown_bucket = 'markdown_absent' AND html_bucket = 'html_present' AND trust_bucket = 'TRUSTED_CURRENT' AND policy_bucket = 'content-html-v1' AND hash_bucket = 'valid' AS trusted_html_only/i)
  assert.match(compact, /markdown_bucket = 'markdown_absent' AND html_bucket = 'html_absent' AS source_missing/i)
  assert.match(compact, /NOT trusted_html_only AND markdown_bucket = 'markdown_absent' AND html_bucket = 'html_present' AS revalidation_candidate/i)
  assert.match(compact, /revalidation_candidate OR source_missing AS transition_blocker/i)
  for (const bucket of ["lifecycle", "markdown_bucket", "html_bucket", "trust_bucket", "policy_bucket", "hash_bucket"]) {
    assert.match(sql, new RegExp(`${bucket}\\s+IS\\s+NULL\\s+OR\\s+${bucket}\\s+NOT\\s+IN`, "i"))
  }
  assert.match(sql, /unknown_shape_total\s*=\s*0/i)
  assert.match(sql, /1\s*\/\s*\(total_rows\s*-\s*total_rows\)/)
  assert.match(sql, /GROUP\s+BY\s+lifecycle,\s+markdown_bucket,\s+html_bucket,\s+trust_bucket,\s+policy_bucket,\s+hash_bucket/i)
  assert.doesNotMatch(sql, /\b(?:p\.id|content_html\s+AS|content\s+AS|content_html_hash\s+AS)\b/i)
})
