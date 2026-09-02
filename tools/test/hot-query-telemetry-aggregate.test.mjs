import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const sqlPath = path.join(repoRoot, "deploy/homeserver/sql/hot_query_telemetry_aggregate.sql")
const inventoryPath = path.join(repoRoot, "tools/test/test-execution-inventory.json")
const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml")

const recordTypes = new Set(["meta", "shape"])
const metaMetrics = new Set([
  "stats_reset_epoch_seconds",
  "deallocations",
  "shape_count",
])
const shapeMetrics = new Set([
  "statement_count",
  "calls",
  "total_exec_time_ms",
  "rows",
  "shared_blks_read",
  "temp_blks_written",
])
const kinds = new Set(["select", "insert", "update", "delete", "other"])
const domains = new Set(["post", "member", "session", "storage", "task", "system", "other"])
const featureNames = ["search", "tag", "join", "group", "order", "limit", "distinct"]
const canonicalNumber = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/

function readSql() {
  return readFileSync(sqlPath, "utf8")
}

function parseShapeIdentity(identity) {
  const fields = identity.split("|")
  assert.equal(fields.length, 9, "shape identity must contain nine fixed tokens")
  const expectedNames = ["kind", "domain", ...featureNames]
  const parsed = Object.fromEntries(fields.map((field, index) => {
    const [name, value, ...extra] = field.split("=")
    assert.equal(extra.length, 0, "identity tokens must contain one equals sign")
    assert.equal(name, expectedNames[index], "identity token order must remain stable")
    return [name, value]
  }))
  assert.ok(kinds.has(parsed.kind), "shape kind must be allowlisted")
  assert.ok(domains.has(parsed.domain), "shape domain must be allowlisted")
  for (const feature of featureNames) {
    assert.ok(["f", "t"].includes(parsed[feature]), `${feature} must be a fixed boolean token`)
  }
  return parsed
}

function parseAggregateOutput(output, stderr = "") {
  assert.equal(stderr, "", "stderr must be empty")
  assert.ok(output.endsWith("\n"), "output must end with one newline")
  assert.ok(!output.includes("\r"), "output must use LF framing")
  const rows = output.slice(0, -1).split("\n")
  assert.ok(rows.length >= 4, "output must include three meta rows and one shape")
  const seen = new Set()
  const rowKeys = []
  const shapes = new Map()
  const meta = new Map()

  for (const row of rows) {
    const fields = row.split("\t")
    assert.equal(fields.length, 4, "each row must have exactly four tab-delimited fields")
    const [recordType, identity, metric, value] = fields
    assert.ok(recordTypes.has(recordType), "record type must be allowlisted")
    assert.match(value, canonicalNumber, "metric value must be canonical non-negative decimal")
    const rowKey = `${recordType}\t${identity}\t${metric}`
    assert.ok(!seen.has(rowKey), "output must not contain duplicate rows")
    seen.add(rowKey)
    rowKeys.push(rowKey)

    if (recordType === "meta") {
      assert.equal(identity, "collector", "meta identity must remain collector")
      assert.ok(metaMetrics.has(metric), "meta metric must be allowlisted")
      meta.set(metric, value)
      continue
    }

    assert.ok(shapeMetrics.has(metric), "shape metric must be allowlisted")
    parseShapeIdentity(identity)
    const metrics = shapes.get(identity) ?? new Map()
    metrics.set(metric, value)
    shapes.set(identity, metrics)
  }

  assert.deepEqual(new Set(meta.keys()), metaMetrics, "output must contain the complete meta set")
  assert.deepEqual(rowKeys, [...rowKeys].sort(), "output rows must preserve deterministic lexical order")
  assert.ok(shapes.size > 0 && shapes.size <= 128, "shape count must stay in the bounded vocabulary")
  assert.equal(meta.get("shape_count"), String(shapes.size), "shape_count must match emitted shapes")
  for (const metrics of shapes.values()) {
    assert.deepEqual(new Set(metrics.keys()), shapeMetrics, "each shape must contain the complete metric set")
  }
  return { meta, shapes }
}

test("pins the raw-free read-only aggregate SQL contract", () => {
  const sql = readSql()
  for (const fragment of [
    "\\set ON_ERROR_STOP 1",
    "\\set QUIET 1",
    "\\pset format unaligned",
    "\\pset tuples_only on",
    "\\pset fieldsep '\\t'",
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;",
    "SET LOCAL statement_timeout = '5s';",
    "SET LOCAL lock_timeout = '1s';",
    "FROM public.pg_stat_statements AS statements",
    "statements.dbid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())",
    "statements.toplevel",
    "statements.calls > 0",
    "ROLLBACK;",
  ]) {
    assert.ok(sql.includes(fragment), `SQL must include ${fragment}`)
  }
  assert.match(sql, /CASE WHEN EXISTS \(SELECT 1 FROM source WHERE query IS NULL\) THEN 0 ELSE 1 END/, "null query must fail closed")
  assert.match(sql, /CASE WHEN shape_count\.count = 0 OR shape_count\.count > 128 THEN 0 ELSE 1 END/, "shape cardinality must fail closed")
  assert.match(sql, /CASE WHEN collector\.row_count = 1 AND collector\.stats_reset IS NOT NULL THEN 1 ELSE 0 END/, "missing or duplicate reset metadata must fail closed")
  assert.match(sql, /WHERE source_guard\.ok = 1/, "source guard must be consumed by an executable predicate")
  assert.equal((sql.match(/WHERE collector_guard\.reset_ok = 1/g) ?? []).length, 4, "every output branch must consume the metadata guard")
  assert.equal((sql.match(/AND shape_guard\.count_ok = 1/g) ?? []).length, 4, "every output branch must consume the shape guard")
  assert.match(sql, /FROM public\.pg_stat_statements_info AS info/, "collector metadata must use the installed public extension view")
  assert.match(sql, /pgroonga_post_match\|like\|ilike/, "search identity must describe a search operation rather than any filter")
  assert.match(sql, /post_tag_index/, "tag identity must use the canonical tag index relation")
  assert.match(sql, /kind=|domain=|search=|tag=|join=|group=|order=|limit=|distinct=/, "identity must use fixed tokens")
  assert.match(sql, /statement_count|total_exec_time_ms|shared_blks_read|temp_blks_written/, "SQL must emit only the fixed shape metric vocabulary")
  assert.match(sql, /ORDER BY record_type, identity, metric/, "output must be deterministic")
  assert.doesNotMatch(sql, /\b(?:insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+|alter\s+|drop\s+|copy\s+)\b/i, "SQL must not contain DML, DDL, or COPY")
  assert.doesNotMatch(sql, /\bCOMMIT\b/i, "SQL must always roll back")
  assert.doesNotMatch(sql, /select\s+\*/i, "SQL must not use wildcard projection")
  assert.doesNotMatch(sql, /(?:queryid|userid|query\s+AS|md5\s*\(|sha\d*\s*\()/i, "SQL must not project or derive raw statement identity")
})

test("parses only complete raw-free aggregate output", () => {
  const valid = [
    "meta\tcollector\tdeallocations\t0",
    "meta\tcollector\tshape_count\t1",
    "meta\tcollector\tstats_reset_epoch_seconds\t1725235200",
    "shape\tkind=select|domain=post|search=t|tag=f|join=f|group=f|order=t|limit=t|distinct=f\tcalls\t12",
    "shape\tkind=select|domain=post|search=t|tag=f|join=f|group=f|order=t|limit=t|distinct=f\trows\t6",
    "shape\tkind=select|domain=post|search=t|tag=f|join=f|group=f|order=t|limit=t|distinct=f\tshared_blks_read\t1",
    "shape\tkind=select|domain=post|search=t|tag=f|join=f|group=f|order=t|limit=t|distinct=f\tstatement_count\t2",
    "shape\tkind=select|domain=post|search=t|tag=f|join=f|group=f|order=t|limit=t|distinct=f\ttemp_blks_written\t0",
    "shape\tkind=select|domain=post|search=t|tag=f|join=f|group=f|order=t|limit=t|distinct=f\ttotal_exec_time_ms\t15.25",
  ].join("\n") + "\n"
  assert.equal(parseAggregateOutput(valid).shapes.size, 1)

  for (const invalid of [
    valid.replace("shape_count\t1", "shape_count\t2"),
    valid.replace("\tstatement_count\t2", "\tunknown\t2"),
    valid.replace("kind=select", "kind=raw_users"),
    valid.replace("\trows\t6", "\trows\t06"),
    valid.replace("\trows\t6", "\trows\t-1"),
    valid.replace("\trows\t6", "\trows\t6\nshape\tkind=select|domain=post|search=t|tag=f|join=f|group=f|order=t|limit=t|distinct=f\trows\t6"),
    valid.replace("\ttemp_blks_written\t0\n", ""),
    valid.replace("\n", "\r\n"),
    valid.replace("meta\tcollector", "NOTICE: leaked output\nmeta\tcollector"),
  ]) {
    assert.throws(() => parseAggregateOutput(invalid))
  }
  assert.throws(() => parseAggregateOutput(valid, "NOTICE: stderr"))
})

test("registers the focused contract test in Platform standalone CI", () => {
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"))
  const entry = inventory.entries.find(({ path: entryPath }) => entryPath === "tools/test/hot-query-telemetry-aggregate.test.mjs")
  assert.deepEqual(entry, {
    path: "tools/test/hot-query-telemetry-aggregate.test.mjs",
    kind: "direct-ci",
    workflow: ".github/workflows/ci.yml",
    job: "platform-standalone",
    step: "Verify hot-query telemetry aggregate contract",
  })
  const workflow = readFileSync(workflowPath, "utf8")
  assert.match(workflow, /- name: Verify hot-query telemetry aggregate contract\n        run: node --test tools\/test\/hot-query-telemetry-aggregate\.test\.mjs/, "CI step must be literal and fail-propagating")
})
