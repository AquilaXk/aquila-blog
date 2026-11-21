import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const root = path.resolve(import.meta.dirname, "../..")
const sqlPath = path.join(root, "deploy/homeserver/sql/hot_query_telemetry_candidate.sql")
const inventoryPath = path.join(root, "tools/test/test-execution-inventory.json")
const workflowPath = path.join(root, ".github/workflows/ci.yml")
const repositoryPath = path.join(root, "back/src/main/kotlin/com/back/boundedContexts/post/adapter/persistence/PostRepositoryImpl.kt")
const tagRepositoryPath = path.join(root, "back/src/main/kotlin/com/back/boundedContexts/post/adapter/persistence/PostTagIndexJdbcRepository.kt")
const publicControllerPath = path.join(root, "back/src/main/kotlin/com/back/boundedContexts/post/adapter/web/ApiV1PostPublicReadController.kt")
const imageControllerPath = path.join(root, "back/src/main/kotlin/com/back/boundedContexts/post/adapter/web/ApiV1PostImageController.kt")
const image = "postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29"
const enabled = process.env.HOT_QUERY_POSTGRES_INTEGRATION === "1"
const dockerCommandTimeoutMs = 10_000
const dockerStartupTimeoutMs = 60_000
const ownerMap = new Map([
  ["PUBLIC_OFFSET_LIST", ["findQPagedByKw", "/post/api/v1/posts", "/feed", "/explore", "/search"]],
  ["PUBLIC_TAG_OFFSET_LIST", ["findQPagedByKwAndTag", "/explore", "/search"]],
  ["PUBLIC_CURSOR_LIST", ["findPublicByCursor", "/feed/cursor", "/bootstrap"]],
  ["PUBLIC_TAG_CURSOR_LIST", ["findPublicByTagCursor", "/explore/cursor", "/bootstrap"]],
  ["PUBLIC_RELATED_AUTHOR", ["findPublicByAuthorExceptPost", "/related/author"]],
  ["PUBLIC_TAG_COUNTS", ["findAllPublicTagCounts", "/tags", "/bootstrap", "/explore"]],
  ["PUBLIC_DETAIL_META", ["findPublicDetailById", "/{id}", "/images/**"]],
  ["PUBLIC_DETAIL_CONTENT", ["findPublicDetailContentById", "/{id}"]],
])
const labels = new Set(ownerMap.keys())
const metrics = new Set(["statement_count", "calls", "total_exec_time_ms", "rows", "shared_blks_read", "temp_blks_written"])
const integers = /^(?:0|[1-9][0-9]*)$/
const decimals = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/
const flywayVersion = /^[1-9][0-9]*(?:\.[0-9]+)*$/

const sql = () => readFileSync(sqlPath, "utf8")
const dockerTimeoutFor = (args) => args[0] === "run" ? dockerStartupTimeoutMs : dockerCommandTimeoutMs
const docker = (args, options = {}) => {
  const result = spawnSync("docker", args, { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024, ...options, timeout: dockerTimeoutFor(args) })
  if (result.error || result.signal || result.status !== 0) throw new Error(`docker ${args[0]} failed without exposing command output`)
  return result.stdout
}

function parse(output, stderr = "") {
  assert.equal(stderr, "")
  assert.ok(output.endsWith("\n"))
  assert.ok(!output.includes("\r"))
  const meta = new Map()
  const candidates = new Map()
  const seen = new Set()
  const rowKeys = []
  const rows = output.slice(0, -1).split("\n")
  assert.ok(rows.length >= 3)
  for (const row of rows) {
    const [type, identity, metric, value, ...extra] = row.split("\t")
    assert.equal(extra.length, 0)
    const rowKey = `${type}\t${identity}\t${metric}`
    assert.ok(!seen.has(rowKey))
    seen.add(rowKey)
    rowKeys.push(rowKey)
    if (type === "meta") {
      assert.equal(identity, "collector")
      assert.ok(["stats_reset_epoch_seconds", "deallocations", "candidate_count", "flyway_version", "observed_at_epoch_seconds"].includes(metric))
      assert.match(value, metric === "flyway_version" ? flywayVersion : integers)
      meta.set(metric, value)
      continue
    }
    assert.equal(type, "candidate")
    assert.ok(labels.has(identity))
    assert.ok(metrics.has(metric))
    assert.match(value, metric === "total_exec_time_ms" ? decimals : integers)
    const candidate = candidates.get(identity) ?? new Map()
    candidate.set(metric, value)
    candidates.set(identity, candidate)
  }
  assert.deepEqual(new Set(meta.keys()), new Set(["stats_reset_epoch_seconds", "deallocations", "candidate_count", "flyway_version", "observed_at_epoch_seconds"]))
  assert.deepEqual(rowKeys, [...rowKeys].sort())
  assert.ok(candidates.size <= labels.size)
  assert.equal(meta.get("candidate_count"), String(candidates.size))
  for (const candidate of candidates.values()) {
    assert.deepEqual(new Set(candidate.keys()), metrics)
    assert.equal(candidate.get("statement_count"), "1")
    assert.ok(Number(candidate.get("calls")) > 0)
  }
  return { meta, candidates }
}

test("pins raw-free owner admission and all fixed labels", () => {
  const source = sql()
  assert.equal(dockerTimeoutFor(["run"]), dockerStartupTimeoutMs, "cold-image startup must use its dedicated finite bound")
  assert.equal(dockerTimeoutFor(["exec"]), dockerCommandTimeoutMs, "ordinary Docker commands must retain the short bound")
  assert.ok(dockerStartupTimeoutMs > dockerCommandTimeoutMs, "cold-image startup must not inherit the ordinary command bound")
  for (const fragment of ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;", "SET LOCAL statement_timeout = '5s';", "FROM :\"extension_schema\".pg_stat_statements AS statements", "statements.toplevel", "statements.calls > 0", "is_keyword_variant", "is_shared_hydration", "cardinality(labels) = 1", "ROLLBACK;"]) assert.ok(source.includes(fragment))
  for (const label of labels) assert.ok(source.includes(`'${label}'`))
  assert.match(source, /metadata_before\.stats_reset = metadata_after\.stats_reset/)
  assert.match(source, /metadata_before\.dealloc = metadata_after\.dealloc/)
  assert.match(source, /statements\.queryid, statements\.query/)
  assert.match(source, /count\(\*\) > 0[\s\S]*count\(\*\) FILTER \(WHERE queryid IS NULL OR query IS NULL\) = 0/)
  assert.match(source, /HAVING count\(DISTINCT queryid\) = 1 AND sum\(calls\) > 0/)
  assert.match(source, /candidate_count\.count BETWEEN 0 AND 8/)
  assert.match(source, /ORDER BY record_type, identity, metric/)
  const output = source.slice(source.indexOf("output_rows"))
  assert.doesNotMatch(output, /queryid|userid|query\s+AS|md5\s*\(|sha\d*\s*\(/i)
  assert.doesNotMatch(source, /\b(?:insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+|alter\s+|drop\s+|copy\s+)\b/i)
  assert.doesNotMatch(source, /SELECT\s+\*/i)
})

test("parses only fixed raw-free candidate rows and permits zero candidates", () => {
  const zero = "meta\tcollector\tcandidate_count\t0\nmeta\tcollector\tdeallocations\t0\nmeta\tcollector\tflyway_version\t20260903.1\nmeta\tcollector\tobserved_at_epoch_seconds\t0\nmeta\tcollector\tstats_reset_epoch_seconds\t1\n"
  assert.equal(parse(zero).candidates.size, 0)
  const valid = [
    "candidate\tPUBLIC_TAG_COUNTS\tcalls\t2",
    "candidate\tPUBLIC_TAG_COUNTS\trows\t2",
    "candidate\tPUBLIC_TAG_COUNTS\tshared_blks_read\t0",
    "candidate\tPUBLIC_TAG_COUNTS\tstatement_count\t1",
    "candidate\tPUBLIC_TAG_COUNTS\ttemp_blks_written\t0",
    "candidate\tPUBLIC_TAG_COUNTS\ttotal_exec_time_ms\t1.2",
    "meta\tcollector\tcandidate_count\t1",
    "meta\tcollector\tdeallocations\t0",
    "meta\tcollector\tflyway_version\t20260903.1",
    "meta\tcollector\tobserved_at_epoch_seconds\t1",
    "meta\tcollector\tstats_reset_epoch_seconds\t1",
  ].join("\n") + "\n"
  assert.equal(parse(valid).candidates.size, 1)
  for (const invalid of [
    valid.replace("PUBLIC_TAG_COUNTS", "UNKNOWN"),
    valid.replace("\trows\t2", "\tunknown\t2"),
    valid.replace("\tstatement_count\t1", "\tstatement_count\t2"),
    valid.replace("\tcalls\t2", "\tcalls\t0"),
    valid.replace("candidate_count\t1", "candidate_count\t0"),
    valid.replace("\trows\t2\n", ""),
    valid.replace("\n", "\r\n"),
    zero.replace("candidate_count\t0", "candidate_count\t01"),
    zero.replace("flyway_version\t20260903.1", "flyway_version\t0"),
    zero.replace("flyway_version\t20260903.1", "flyway_version\t0.1"),
    zero.replace("observed_at_epoch_seconds\t0", "observed_at_epoch_seconds\t-1"),
    zero.replace("observed_at_epoch_seconds\t0", "observed_at_epoch_seconds\t00"),
  ]) assert.throws(() => parse(invalid))
  assert.throws(() => parse(valid, "unexpected stderr"))
})

test("pins every candidate label to one current repository method and endpoint set", () => {
  const repository = readFileSync(repositoryPath, "utf8")
  const tagRepository = readFileSync(tagRepositoryPath, "utf8")
  const publicController = readFileSync(publicControllerPath, "utf8")
  const imageController = readFileSync(imageControllerPath, "utf8")

  for (const [label, [method, ...endpoints]] of ownerMap) {
    const ownerSource = method === "findAllPublicTagCounts" ? tagRepository : repository
    assert.match(ownerSource, new RegExp(`override fun ${method}\\(`), `${label} method must remain current`)
    for (const endpoint of endpoints) {
      const endpointSource = endpoint === "/images/**" ? imageController : publicController
      assert.ok(endpointSource.includes(`"${endpoint}"`), `${label} endpoint ${endpoint} must remain current`)
    }
  }

  const offsetPath = repository.slice(repository.indexOf("private fun findPosts("), repository.indexOf("private fun findPublicPostsByCursor("))
  const cursorPath = repository.slice(repository.indexOf("private fun findPublicPostsByCursor("), repository.indexOf("private fun buildKwPredicate("))
  assert.ok(offsetPath.includes("fetchPostsByIds(postIds)"))
  assert.ok(cursorPath.includes("fetchPostsByIds(ids)"))
  assert.ok(!labels.has("SHARED_POST_HYDRATION"))
})

test("runs PostgreSQL 18 shared hydration admission regression", { timeout: 120_000, skip: enabled ? false : "requires HOT_QUERY_POSTGRES_INTEGRATION=1" }, async () => {
  const name = `aquila-hot-candidate-${process.pid}-${Date.now()}`; let started = false
  try {
    docker(["run", "--detach", "--rm", "--name", name, "--env", "POSTGRES_HOST_AUTH_METHOD=trust", image, "-c", "shared_preload_libraries=pg_stat_statements"]); started = true
    let ready = false
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const probe = spawnSync("docker", ["exec", name, "pg_isready", "-h", "127.0.0.1", "-p", "5432", "-U", "postgres"], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: dockerCommandTimeoutMs })
      if (!probe.error && !probe.signal && probe.status === 0) { ready = true; break }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    assert.equal(ready, true)
    const psql = (input) => docker(["exec", "--interactive", name, "psql", "-X", "-q", "-A", "-t", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input })
    psql(`
      CREATE SCHEMA telemetry;
      CREATE EXTENSION pg_stat_statements WITH SCHEMA telemetry;
      CREATE TABLE public.flyway_schema_history (installed_rank integer PRIMARY KEY, version text, success boolean NOT NULL);
      INSERT INTO public.flyway_schema_history VALUES (1, '20260903.1', true), (2, NULL, true), (3, '20260903.2', false);
      CREATE TABLE post (id bigint PRIMARY KEY, published boolean NOT NULL, listed boolean NOT NULL, author_id bigint NOT NULL);
      CREATE TABLE member (id bigint PRIMARY KEY);
      CREATE TABLE post_tag_index (post_id bigint NOT NULL, tag text NOT NULL);
      CREATE TABLE telemetry.first_ids (id bigint PRIMARY KEY);
      INSERT INTO post VALUES (1, true, true, 1), (2, true, true, 2);
      INSERT INTO member VALUES (1), (2);
      INSERT INTO post_tag_index VALUES (1, 'kotlin'), (2, 'spring');
      SELECT telemetry.pg_stat_statements_reset();
      SELECT p.id
      FROM post p
      WHERE p.published AND p.listed
      ORDER BY p.id DESC
      OFFSET 0 LIMIT 2;
      SELECT DISTINCT p.id FROM post p LEFT JOIN member m ON m.id = p.id WHERE p.id IN (1, 2) AND p.published AND p.listed AND p.author_id > 0 ORDER BY p.id DESC LIMIT 2;
      INSERT INTO telemetry.first_ids
      SELECT queryid FROM telemetry.pg_stat_statements WHERE query ~* '^\\s*SELECT DISTINCT';
      SELECT telemetry.pg_stat_statements_reset();
      SELECT p.id
      FROM post p
      WHERE p.published AND p.listed AND p.id < 3
      ORDER BY p.id DESC
      LIMIT 2;
      SELECT DISTINCT p.id FROM post p LEFT JOIN member m ON m.id = p.id WHERE p.id IN (1, 2) AND p.published AND p.listed AND p.author_id > 0 ORDER BY p.id DESC LIMIT 2;
      SELECT pti.tag, count(*)
      FROM post_tag_index pti
      JOIN post p ON p.id = pti.post_id
      WHERE p.published AND p.listed
      GROUP BY pti.tag
      ORDER BY count(*) DESC, pti.tag ASC;
    `)
    const intersection = psql("SELECT count(*) FROM telemetry.first_ids JOIN telemetry.pg_stat_statements s ON s.queryid = first_ids.id WHERE s.query ~* '^\\s*SELECT DISTINCT';").trim()
    assert.match(intersection, /^[1-9][0-9]*$/)
    const observedBefore = Math.floor(Date.now() / 1000)
    const result = spawnSync("docker", ["exec", "--interactive", name, "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { cwd: root, encoding: "utf8", input: sql(), maxBuffer: 1024 * 1024, timeout: dockerCommandTimeoutMs })
    const observedAfter = Math.floor(Date.now() / 1000)
    assert.equal(result.error, undefined)
    assert.equal(result.signal, null)
    assert.equal(result.status, 0)
    const parsed = parse(result.stdout, result.stderr)
    assert.deepEqual([...parsed.candidates.keys()], ["PUBLIC_CURSOR_LIST", "PUBLIC_TAG_COUNTS"])
    assert.equal(parsed.meta.get("flyway_version"), "20260903.1")
    assert.ok(Number(parsed.meta.get("observed_at_epoch_seconds")) >= observedBefore)
    assert.ok(Number(parsed.meta.get("observed_at_epoch_seconds")) <= observedAfter)
    assert.equal(parsed.candidates.get("PUBLIC_CURSOR_LIST").get("statement_count"), "1")
    assert.equal(parsed.candidates.get("PUBLIC_TAG_COUNTS").get("statement_count"), "1")
  } finally { if (started) spawnSync("docker", ["rm", "--force", name], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: dockerCommandTimeoutMs }) }
})

test("registers the focused contract in Platform standalone CI", () => {
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"))
  assert.deepEqual(inventory.entries.find((entry) => entry.path === "tools/test/hot-query-telemetry-candidate.test.mjs"), { path: "tools/test/hot-query-telemetry-candidate.test.mjs", kind: "direct-ci", workflow: ".github/workflows/ci.yml", job: "platform-standalone", step: "Verify hot-query telemetry candidate contract" })
  assert.match(readFileSync(workflowPath, "utf8"), /Verify hot-query telemetry candidate contract[\s\S]*HOT_QUERY_POSTGRES_INTEGRATION: "1"[\s\S]*hot-query-telemetry-candidate\.test\.mjs/)
})
