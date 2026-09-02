import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const sqlPath = path.join(repoRoot, "deploy/homeserver/sql/hot_query_telemetry_aggregate.sql")
const inventoryPath = path.join(repoRoot, "tools/test/test-execution-inventory.json")
const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml")
const postgresImage = "postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29"
const postgresIntegrationEnabled = process.env.HOT_QUERY_POSTGRES_INTEGRATION === "1"
const dockerTimeoutMs = 10_000

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
const canonicalInteger = /^(?:0|[1-9][0-9]*)$/
const canonicalDecimal = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/

function readSql() {
  return readFileSync(sqlPath, "utf8")
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    ...options,
    timeout: dockerTimeoutMs,
  })
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`docker ${args[0]} failed without exposing command output`)
  }
  return result.stdout
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
    const rowKey = `${recordType}\t${identity}\t${metric}`
    assert.ok(!seen.has(rowKey), "output must not contain duplicate rows")
    seen.add(rowKey)
    rowKeys.push(rowKey)

    if (recordType === "meta") {
      assert.equal(identity, "collector", "meta identity must remain collector")
      assert.ok(metaMetrics.has(metric), "meta metric must be allowlisted")
      assert.match(value, canonicalInteger, "meta metric must be a canonical non-negative integer")
      meta.set(metric, value)
      continue
    }

    assert.ok(shapeMetrics.has(metric), "shape metric must be allowlisted")
    assert.match(
      value,
      metric === "total_exec_time_ms" ? canonicalDecimal : canonicalInteger,
      `${metric} must use its canonical numeric type`,
    )
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
    "FROM :\"extension_schema\".pg_stat_statements AS statements",
    "statements.dbid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())",
    "statements.toplevel",
    "statements.calls > 0",
    "ROLLBACK;",
  ]) {
    assert.ok(sql.includes(fragment), `SQL must include ${fragment}`)
  }
  assert.match(sql, /FROM pg_catalog\.pg_extension AS extension[\s\S]*FROM :"extension_schema"\.pg_stat_statements AS statements/, "extension namespace must come from the catalog")
  assert.match(sql, /WHERE extension\.extname = 'pg_stat_statements'\s*\\gset/, "namespace lookup must require exactly one psql gset row")
  assert.match(sql, /count\(\*\) > 0 AND count\(\*\) FILTER \(WHERE query IS NULL\) = 0/, "empty or null query material must fail closed")
  assert.match(sql, /CASE WHEN shape_count\.count = 0 OR shape_count\.count > 128 THEN 0 ELSE 1 END/, "shape cardinality must fail closed")
  assert.match(sql, /metadata_before AS MATERIALIZED/, "metadata before the source must be materialized")
  assert.match(sql, /source AS MATERIALIZED/, "statement source must be materialized")
  assert.match(sql, /metadata_after AS MATERIALIZED/, "metadata after the source must be materialized")
  assert.match(sql, /metadata_before\.stats_reset = metadata_after\.stats_reset/, "reset identity must remain stable")
  assert.match(sql, /metadata_before\.dealloc = metadata_after\.dealloc/, "deallocation identity must remain stable")
  assert.match(sql, /metadata_after\.source_dependency > 0/, "post-source metadata must consume the source snapshot")
  assert.match(sql, /WHERE source_guard\.ok = 1/, "source guard must be consumed by an executable predicate")
  assert.equal((sql.match(/WHERE snapshot_guard\.snapshot_ok = 1/g) ?? []).length, 4, "every output branch must consume the snapshot guard")
  assert.equal((sql.match(/AND shape_guard\.count_ok = 1/g) ?? []).length, 4, "every output branch must consume the shape guard")
  assert.equal((sql.match(/FROM :"extension_schema"\.pg_stat_statements_info AS info/g) ?? []).length, 2, "both metadata reads must use the resolved extension schema")
  assert.match(sql, /pgroonga_post_match\|like\|ilike/, "search identity must describe a search operation rather than any filter")
  assert.match(sql, /post_tag_index/, "tag identity must use the canonical tag index relation")
  assert.doesNotMatch(sql, /\(select\|with\)/, "WITH statements must not be assumed to be read-only selects")
  assert.match(sql, /kind=|domain=|search=|tag=|join=|group=|order=|limit=|distinct=/, "identity must use fixed tokens")
  assert.match(sql, /statement_count|total_exec_time_ms|shared_blks_read|temp_blks_written/, "SQL must emit only the fixed shape metric vocabulary")
  assert.match(sql, /ORDER BY record_type, identity, metric/, "output must be deterministic")
  assert.doesNotMatch(sql, /\b(?:insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+|alter\s+|drop\s+|copy\s+)\b/i, "SQL must not contain DML, DDL, or COPY")
  assert.doesNotMatch(sql, /\bCOMMIT\b/i, "SQL must always roll back")
  assert.doesNotMatch(sql, /select\s+\*/i, "SQL must not use wildcard projection")
  assert.doesNotMatch(sql, /(?:queryid|userid|query\s+AS|md5\s*\(|sha\d*\s*\()/i, "SQL must not project or derive raw statement identity")
})

test("bounds Docker execution and isolates the PostgreSQL 18 regression fixture", () => {
  const testSource = readFileSync(new URL(import.meta.url), "utf8")
  const dockerSpawnCount = (testSource.match(/spawnSync\("docker"/g) ?? []).length
  const dockerTimeoutCount = (testSource.match(new RegExp(`timeout:\\s+${"dockerTimeoutMs"}`, "g")) ?? []).length
  assert.equal(dockerTimeoutCount, dockerSpawnCount, "every synchronous Docker spawn must have a finite timeout")
  assert.match(
    testSource,
    /\["exec", containerName, "pg_isready", "-h", "127\.0\.0\.1", "-p", "5432", "-U", "postgres"\]/,
    "readiness must probe PostgreSQL's final TCP listener",
  )
  assert.match(
    testSource,
    /SELECT telemetry\.pg_stat_statements_reset\(\);\nSELECT id FROM public\.post/,
    "the fixture must reset statistics after setup and before the intended workload",
  )
  assert.match(
    testSource,
    /const withIdentity = "kind=other\|domain=post\|search=f\|tag=f\|join=f\|group=f\|order=f\|limit=f\|distinct=f"/,
    "the regression must assert the exact data-modifying WITH identity",
  )
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
    valid.replace("\tcalls\t12", "\tcalls\t1.5"),
    valid.replace("\tdeallocations\t0", "\tdeallocations\t0.5"),
    valid.replace("\ttotal_exec_time_ms\t15.25", "\ttotal_exec_time_ms\t15.2500"),
    valid.replace("\trows\t6", "\trows\t6\nshape\tkind=select|domain=post|search=t|tag=f|join=f|group=f|order=t|limit=t|distinct=f\trows\t6"),
    valid.replace("\ttemp_blks_written\t0\n", ""),
    valid.replace("\n", "\r\n"),
    valid.replace("meta\tcollector", "NOTICE: leaked output\nmeta\tcollector"),
  ]) {
    assert.throws(() => parseAggregateOutput(invalid))
  }
  assert.throws(() => parseAggregateOutput(valid, "NOTICE: stderr"))
})

test("executes the exact contract on PostgreSQL 18 with a relocated extension", {
  timeout: 60_000,
  skip: postgresIntegrationEnabled ? false : "requires HOT_QUERY_POSTGRES_INTEGRATION=1 and Docker",
}, async () => {
  const containerName = `aquila-hot-query-${process.pid}-${Date.now()}`
  let started = false
  try {
    runDocker([
      "run", "--detach", "--rm", "--name", containerName,
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
      postgresImage,
      "-c", "shared_preload_libraries=pg_stat_statements",
    ])
    started = true

    let ready = false
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const probe = spawnSync("docker", ["exec", containerName, "pg_isready", "-h", "127.0.0.1", "-p", "5432", "-U", "postgres"], {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeout: dockerTimeoutMs,
      })
      if (!probe.error && !probe.signal && probe.status === 0) {
        ready = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    assert.equal(ready, true, "PostgreSQL 18 fixture must become ready")

    const fixtureSql = `
CREATE SCHEMA telemetry;
CREATE EXTENSION pg_stat_statements WITH SCHEMA telemetry;
CREATE TABLE public.post (id bigint PRIMARY KEY, title text NOT NULL);
INSERT INTO public.post (id, title) VALUES (1, 'alpha'), (2, 'beta');
SELECT telemetry.pg_stat_statements_reset();
SELECT id FROM public.post WHERE title LIKE 'a%' ORDER BY id LIMIT 1;
WITH changed AS (UPDATE public.post SET title = title WHERE id = 2 RETURNING id)
SELECT count(*) FROM changed;
`
    runDocker([
      "exec", "--interactive", containerName,
      "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-",
    ], { input: fixtureSql })

    const collector = spawnSync("docker", [
      "exec", "--interactive", containerName,
      "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      input: readSql(),
      maxBuffer: 1024 * 1024,
      timeout: dockerTimeoutMs,
    })
    assert.equal(collector.error, undefined, "collector process must start")
    assert.equal(collector.signal, null, "collector process must not receive a signal")
    assert.equal(collector.status, 0, "collector SQL must execute successfully")
    const parsed = parseAggregateOutput(collector.stdout, collector.stderr)
    const withIdentity = "kind=other|domain=post|search=f|tag=f|join=f|group=f|order=f|limit=f|distinct=f"
    const withMetrics = parsed.shapes.get(withIdentity)
    assert.ok(withMetrics, "data-modifying WITH statements must remain conservatively classified as other")
    assert.equal(withMetrics.get("statement_count"), "1", "the reset fixture must exclude setup utility statements")
    assert.equal(withMetrics.get("calls"), "1", "the regression must prove the single intended data-modifying WITH statement")
  } finally {
    if (started) {
      spawnSync("docker", ["rm", "--force", containerName], {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeout: dockerTimeoutMs,
      })
    }
  }
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
  assert.match(
    workflow,
    /- name: Verify hot-query telemetry aggregate contract\n        env:\n          HOT_QUERY_POSTGRES_INTEGRATION: "1"\n        run: node --test tools\/test\/hot-query-telemetry-aggregate\.test\.mjs/,
    "CI step must enable the PostgreSQL integration and fail-propagate",
  )
})
