import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const sqlPath = path.join(repoRoot, "deploy/homeserver/sql/hot_query_telemetry_capability.sql")
const inventoryPath = path.join(repoRoot, "tools/test/test-execution-inventory.json")

function readSql() {
  return readFileSync(sqlPath, "utf8")
}

const expectedKeys = [
  "server_version_num",
  "flyway_version",
  "pg_stat_statements_available",
  "pg_stat_statements_installed",
  "pg_stat_statements_preloaded",
  "pg_stat_statements_track_configured",
]

const expectedSql = String.raw`\set ON_ERROR_STOP 1
\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset fieldsep '\t'

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';

SELECT 'server_version_num' AS key, current_setting('server_version_num') AS value;
SELECT 'flyway_version' AS key, (
    SELECT CASE
        WHEN COUNT(*) = 1 AND max(version) ~ '^[1-9][0-9]*(\.[0-9]+)*$' THEN max(version)
        ELSE (1 / (COUNT(*) - COUNT(*)))::text
    END
    FROM (
        SELECT version
        FROM public.flyway_schema_history
        WHERE success
        ORDER BY installed_rank DESC
        LIMIT 1
    ) AS latest_successful_flyway
) AS value;
SELECT 'pg_stat_statements_available' AS key, EXISTS (
    SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_stat_statements'
) AS value;
SELECT 'pg_stat_statements_installed' AS key, EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_stat_statements'
) AS value;
SELECT 'pg_stat_statements_preloaded' AS key, EXISTS (
    SELECT 1
    FROM unnest(string_to_array(current_setting('shared_preload_libraries'), ','))
    WHERE btrim(unnest) = 'pg_stat_statements'
) AS value;
SELECT 'pg_stat_statements_track_configured' AS key,
    COALESCE(current_setting('pg_stat_statements.track', true), 'none') IN ('top', 'all') AS value;

ROLLBACK;
`

function parseCapabilityOutput(output) {
  const rows = output.trimEnd().split("\n")
  assert.equal(rows.length, expectedKeys.length, "output must contain exactly six rows")
  return rows.map((row, index) => {
    const fields = row.split("\t")
    assert.equal(fields.length, 2, `row ${index + 1} must be one tab-delimited key/value pair`)
    const [key, value] = fields
    assert.equal(key, expectedKeys[index], `row ${index + 1} key must preserve the allowlisted order`)
    assert.notEqual(value, "", `${key} must not be empty`)
    assert.notEqual(value.toLowerCase(), "null", `${key} must not be null`)
    const valuePattern = index < 2
      ? index === 0 ? /^[0-9]+$/ : /^[1-9][0-9]*(\.[0-9]+)*$/
      : /^(?:t|f)$/
    assert.match(value, valuePattern, `${key} has an invalid value`)
    return { key, value }
  })
}

test("pins the complete read-only capability SQL contract", () => {
  assert.equal(readSql(), expectedSql)
})

test("defines the exact lexical production output contract", () => {
  assert.deepEqual(parseCapabilityOutput([
    "server_version_num\t170004",
    "flyway_version\t20260824.1",
    "pg_stat_statements_available\tt",
    "pg_stat_statements_installed\tf",
    "pg_stat_statements_preloaded\tt",
    "pg_stat_statements_track_configured\tf",
  ].join("\n")), [
    { key: "server_version_num", value: "170004" },
    { key: "flyway_version", value: "20260824.1" },
    { key: "pg_stat_statements_available", value: "t" },
    { key: "pg_stat_statements_installed", value: "f" },
    { key: "pg_stat_statements_preloaded", value: "t" },
    { key: "pg_stat_statements_track_configured", value: "f" },
  ])
  for (const invalid of [
    "server_version_num\t170004\nflyway_version\t20260824.1\npg_stat_statements_available\tt\npg_stat_statements_installed\tf\npg_stat_statements_preloaded\tt",
    "server_version_num\t170004\nflyway_version\t20260824.1\npg_stat_statements_available\tt\npg_stat_statements_installed\tf\npg_stat_statements_preloaded\tt\npg_stat_statements_track_configured\tf\nextra\tt",
    "server_version_num\t170004\nflyway_version\t20260824.1\npg_stat_statements_available\tt\npg_stat_statements_installed\tf\npg_stat_statements_preloaded\tt\npg_stat_statements_preloaded\tf",
    "server_version_num\t170004\nflyway_version\tnull\npg_stat_statements_available\tt\npg_stat_statements_installed\tf\npg_stat_statements_preloaded\tt\npg_stat_statements_track_configured\tf",
  ]) {
    assert.throws(() => parseCapabilityOutput(invalid))
  }
})

test("registers the focused contract test in Platform standalone CI", () => {
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"))
  const entry = inventory.entries.find(({ path: entryPath }) => entryPath === "tools/test/hot-query-telemetry-capability.test.mjs")

  assert.deepEqual(entry, {
    path: "tools/test/hot-query-telemetry-capability.test.mjs",
    kind: "direct-ci",
    workflow: ".github/workflows/ci.yml",
    job: "platform-standalone",
    step: "Verify hot-query telemetry capability contract",
  })
})
