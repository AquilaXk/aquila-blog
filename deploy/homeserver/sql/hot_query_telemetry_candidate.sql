\set ON_ERROR_STOP 1
\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset fieldsep '\t'

SELECT namespace.nspname AS extension_schema
FROM pg_catalog.pg_extension AS extension
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = extension.extnamespace
WHERE extension.extname = 'pg_stat_statements'
\gset

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

WITH metadata_before AS MATERIALIZED (
    SELECT min(info.stats_reset) AS stats_reset, coalesce(max(info.dealloc), 0)::bigint AS dealloc,
           count(*)::bigint AS row_count
    FROM :"extension_schema".pg_stat_statements_info AS info
), metadata_before_guard AS MATERIALIZED (
    SELECT 1 / CASE WHEN row_count = 1 AND stats_reset IS NOT NULL THEN 1 ELSE 0 END AS ok
    FROM metadata_before
), source AS MATERIALIZED (
    SELECT statements.queryid, statements.query, statements.calls, statements.total_exec_time, statements.rows,
           statements.shared_blks_read, statements.temp_blks_written
    FROM :"extension_schema".pg_stat_statements AS statements
    CROSS JOIN metadata_before_guard
    WHERE statements.dbid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
      AND statements.toplevel AND statements.calls > 0 AND metadata_before_guard.ok = 1
), source_guard AS MATERIALIZED (
    SELECT 1 / CASE WHEN count(*) > 0
      AND count(*) FILTER (WHERE queryid IS NULL OR query IS NULL) = 0 THEN 1 ELSE 0 END AS ok
    FROM source
), classified AS MATERIALIZED (
    SELECT source.*,
      source.query ~* E'\\m(pgroonga_post_match|like|ilike)\\M' AS is_keyword_variant,
      source.query ~* E'\\mfrom\\s+post\\M.*\\mjoin\\s+member\\M.*\\mid\\s+in\\s*\\(' AS is_shared_hydration,
      array_remove(ARRAY[
        CASE WHEN source.query ~* E'^\\s*select\\M' AND source.query ~* E'\\mfrom\\s+post\\M'
          AND source.query ~* E'\\mpublished\\M' AND source.query ~* E'\\mlisted\\M'
          AND source.query ~* E'\\moffset\\M' AND source.query ~* E'\\m(limit|fetch\\s+first)\\M'
          AND source.query !~* E'\\mexists\\s*\\(\\s*select.*\\mpost_tag_index\\M' THEN 'PUBLIC_OFFSET_LIST' END,
        CASE WHEN source.query ~* E'^\\s*select\\M' AND source.query ~* E'\\mfrom\\s+post\\M'
          AND source.query ~* E'\\mpublished\\M' AND source.query ~* E'\\mlisted\\M'
          AND source.query ~* E'\\moffset\\M' AND source.query ~* E'\\m(limit|fetch\\s+first)\\M'
          AND source.query ~* E'\\mexists\\s*\\(\\s*select.*\\mpost_tag_index\\M' THEN 'PUBLIC_TAG_OFFSET_LIST' END,
        CASE WHEN source.query ~* E'^\\s*select\\M' AND source.query ~* E'\\mfrom\\s+post\\M'
          AND source.query ~* E'\\mpublished\\M' AND source.query ~* E'\\mlisted\\M'
          AND source.query ~* E'\\m(limit|fetch\\s+first)\\M' AND source.query !~* E'\\moffset\\M'
          AND source.query !~* E'\\mexists\\s*\\(\\s*select.*\\mpost_tag_index\\M'
          AND source.query !~* E'\\mdistinct\\M' THEN 'PUBLIC_CURSOR_LIST' END,
        CASE WHEN source.query ~* E'^\\s*select\\M' AND source.query ~* E'\\mfrom\\s+post\\M'
          AND source.query ~* E'\\mpublished\\M' AND source.query ~* E'\\mlisted\\M'
          AND source.query ~* E'\\m(limit|fetch\\s+first)\\M' AND source.query !~* E'\\moffset\\M'
          AND source.query ~* E'\\mexists\\s*\\(\\s*select.*\\mpost_tag_index\\M' THEN 'PUBLIC_TAG_CURSOR_LIST' END,
        CASE WHEN source.query ~* E'^\\s*select\\s+distinct\\M' AND source.query ~* E'\\mfrom\\s+post\\M'
          AND source.query ~* E'\\mjoin\\s+member\\M' AND source.query ~* E'\\mpublished\\M'
          AND source.query ~* E'\\mlisted\\M' AND source.query ~* E'\\mauthor_id\\M'
          AND source.query ~* E'\\morder\\s+by\\M' AND source.query ~* E'\\m(limit|fetch\\s+first)\\M'
          THEN 'PUBLIC_RELATED_AUTHOR' END,
        CASE WHEN source.query ~* E'^\\s*select\\M' AND source.query ~* E'\\mfrom\\s+post_tag_index\\M'
          AND source.query ~* E'\\mjoin\\s+post\\M' AND source.query ~* E'\\mgroup\\s+by\\M'
          AND source.query ~* E'\\morder\\s+by\\M' AND source.query ~* E'\\mpublished\\M'
          AND source.query ~* E'\\mlisted\\M' THEN 'PUBLIC_TAG_COUNTS' END,
        CASE WHEN source.query ~* E'^\\s*select\\M' AND source.query ~* E'\\mfrom\\s+post\\M'
          AND source.query ~* E'\\mjoin\\s+post_attr\\M' AND source.query ~* E'\\mpublished\\M'
          AND source.query !~* E'\\m(limit|fetch\\s+first)\\M'
          THEN 'PUBLIC_DETAIL_META' END,
        CASE WHEN source.query ~* E'^\\s*select\\M' AND source.query ~* E'\\mfrom\\s+post\\M'
          AND source.query ~* E'\\mcontent\\M' AND source.query ~* E'\\mcontent_html\\M'
          AND source.query ~* E'\\mpublished\\M' AND source.query !~* E'\\mjoin\\M'
          AND source.query !~* E'\\m(limit|fetch\\s+first)\\M' THEN 'PUBLIC_DETAIL_CONTENT' END
      ], NULL) AS labels
    FROM source CROSS JOIN source_guard
    WHERE source_guard.ok = 1
), eligible AS MATERIALIZED (
    SELECT labels[1] AS label, queryid, calls, total_exec_time, rows, shared_blks_read, temp_blks_written
    FROM classified
    WHERE cardinality(labels) = 1 AND NOT is_keyword_variant AND NOT is_shared_hydration
), candidates AS MATERIALIZED (
    SELECT label, count(DISTINCT queryid)::numeric AS statement_count, sum(calls)::numeric AS calls,
           round(sum(total_exec_time)::numeric, 3) AS total_exec_time_ms, sum(rows)::numeric AS rows,
           sum(shared_blks_read)::numeric AS shared_blks_read, sum(temp_blks_written)::numeric AS temp_blks_written
    FROM eligible
    GROUP BY label
    HAVING count(DISTINCT queryid) = 1 AND sum(calls) > 0
), candidate_count AS MATERIALIZED (SELECT count(*)::bigint AS count FROM candidates),
metadata_after AS MATERIALIZED (
    SELECT min(info.stats_reset) AS stats_reset, coalesce(max(info.dealloc), 0)::bigint AS dealloc,
           count(*)::bigint AS row_count, (SELECT count(*) FROM source) AS source_dependency
    FROM :"extension_schema".pg_stat_statements_info AS info
), snapshot_guard AS MATERIALIZED (
    SELECT 1 / CASE WHEN metadata_before.row_count = 1 AND metadata_after.row_count = 1
      AND metadata_before.stats_reset IS NOT NULL AND metadata_before.stats_reset = metadata_after.stats_reset
      AND metadata_before.dealloc = metadata_after.dealloc AND metadata_after.source_dependency > 0
      AND candidate_count.count BETWEEN 0 AND 8 THEN 1 ELSE 0 END AS ok
    FROM metadata_before CROSS JOIN metadata_after CROSS JOIN candidate_count
), output_rows(record_type, identity, metric, numeric_value) AS (
    SELECT 'meta'::text, 'collector'::text, 'stats_reset_epoch_seconds'::text,
      floor(extract(epoch FROM metadata_before.stats_reset))::bigint::text
    FROM metadata_before CROSS JOIN snapshot_guard WHERE snapshot_guard.ok = 1
    UNION ALL SELECT 'meta', 'collector', 'deallocations', metadata_before.dealloc::numeric::text
    FROM metadata_before CROSS JOIN snapshot_guard WHERE snapshot_guard.ok = 1
    UNION ALL SELECT 'meta', 'collector', 'candidate_count', candidate_count.count::numeric::text
    FROM candidate_count CROSS JOIN snapshot_guard WHERE snapshot_guard.ok = 1
    UNION ALL
    SELECT 'candidate'::text, candidates.label, metric, numeric_value
    FROM candidates CROSS JOIN snapshot_guard
    CROSS JOIN LATERAL (VALUES
      ('statement_count'::text, candidates.statement_count::text), ('calls', candidates.calls::text),
      ('total_exec_time_ms', candidates.total_exec_time_ms::text), ('rows', candidates.rows::text),
      ('shared_blks_read', candidates.shared_blks_read::text), ('temp_blks_written', candidates.temp_blks_written::text)
    ) AS metrics(metric, numeric_value)
    WHERE snapshot_guard.ok = 1
)
SELECT record_type, identity, metric, numeric_value
FROM output_rows
ORDER BY record_type, identity, metric;

ROLLBACK;
