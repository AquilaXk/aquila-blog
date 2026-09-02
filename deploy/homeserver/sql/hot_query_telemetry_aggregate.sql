\set ON_ERROR_STOP 1
\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset fieldsep '\t'

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

WITH source AS (
    SELECT
        statements.query,
        statements.calls,
        statements.total_exec_time,
        statements.rows,
        statements.shared_blks_read,
        statements.temp_blks_written
    FROM public.pg_stat_statements AS statements
    WHERE statements.dbid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
      AND statements.toplevel
      AND statements.calls > 0
), source_guard AS (
    SELECT 1 / (CASE WHEN EXISTS (SELECT 1 FROM source WHERE query IS NULL) THEN 0 ELSE 1 END) AS ok
), classified AS (
    SELECT
        CASE
            WHEN source.query ~* E'^\\s*(/\\*[^\\n]*\\*/\\s*)?(select|with)\\M' THEN 'select'
            WHEN source.query ~* E'^\\s*(/\\*[^\\n]*\\*/\\s*)?insert\\M' THEN 'insert'
            WHEN source.query ~* E'^\\s*(/\\*[^\\n]*\\*/\\s*)?update\\M' THEN 'update'
            WHEN source.query ~* E'^\\s*(/\\*[^\\n]*\\*/\\s*)?delete\\M' THEN 'delete'
            ELSE 'other'
        END AS kind,
        CASE
            WHEN source.query ~* E'\\m(post|post_attr|post_tag_index|post_write_request_idempotency)\\M' THEN 'post'
            WHEN source.query ~* E'\\mmember_session\\M' THEN 'session'
            WHEN source.query ~* E'\\m(member|member_attr)\\M' THEN 'member'
            WHEN source.query ~* E'\\m(cloud_file|cloud_video_upload_session|cloud_video_upload_part|cloud_external_playback_token|uploaded_file)\\M' THEN 'storage'
            WHEN source.query ~* E'\\mtask_queue\\M' THEN 'task'
            WHEN source.query ~* E'\\m(auth_security_event|admin_operation_receipt|search_runtime_control_state|flyway_schema_history|information_schema|pg_catalog)\\M' THEN 'system'
            ELSE 'other'
        END AS domain,
        CASE WHEN source.query ~* E'\\m(pgroonga_post_match|like|ilike)\\M' THEN 't' ELSE 'f' END AS search,
        CASE WHEN source.query ~* E'\\mpost_tag_index\\M' THEN 't' ELSE 'f' END AS tag,
        CASE WHEN source.query ~* E'\\mjoin\\M' THEN 't' ELSE 'f' END AS join_feature,
        CASE WHEN source.query ~* E'\\mgroup\\s+by\\M' THEN 't' ELSE 'f' END AS group_feature,
        CASE WHEN source.query ~* E'\\morder\\s+by\\M' THEN 't' ELSE 'f' END AS order_feature,
        CASE WHEN source.query ~* E'\\mlimit\\M' THEN 't' ELSE 'f' END AS limit_feature,
        CASE WHEN source.query ~* E'\\mdistinct\\M' THEN 't' ELSE 'f' END AS distinct_feature,
        source.calls,
        source.total_exec_time,
        source.rows,
        source.shared_blks_read,
        source.temp_blks_written
    FROM source
    CROSS JOIN source_guard
    WHERE source_guard.ok = 1
), shapes AS (
    SELECT
        concat(
            'kind=', kind,
            '|domain=', domain,
            '|search=', search,
            '|tag=', tag,
            '|join=', join_feature,
            '|group=', group_feature,
            '|order=', order_feature,
            '|limit=', limit_feature,
            '|distinct=', distinct_feature
        ) AS identity,
        count(*)::numeric AS statement_count,
        sum(calls)::numeric AS calls,
        round(sum(total_exec_time)::numeric, 3) AS total_exec_time_ms,
        sum(rows)::numeric AS rows,
        sum(shared_blks_read)::numeric AS shared_blks_read,
        sum(temp_blks_written)::numeric AS temp_blks_written
    FROM classified
    GROUP BY kind, domain, search, tag, join_feature, group_feature, order_feature, limit_feature, distinct_feature
), shape_count AS (
    SELECT count(*)::bigint AS count FROM shapes
), collector AS (
    SELECT
        min(info.stats_reset) AS stats_reset,
        coalesce(sum(info.dealloc), 0)::bigint AS dealloc,
        count(*)::bigint AS row_count
    FROM public.pg_stat_statements_info AS info
), collector_guard AS (
    SELECT 1 / (CASE WHEN collector.row_count = 1 AND collector.stats_reset IS NOT NULL THEN 1 ELSE 0 END) AS reset_ok
    FROM collector
), shape_guard AS (
    SELECT 1 / (CASE WHEN shape_count.count = 0 OR shape_count.count > 128 THEN 0 ELSE 1 END) AS count_ok
    FROM shape_count
), output_rows AS (
    SELECT
        'meta'::text AS record_type,
        'collector'::text AS identity,
        'stats_reset_epoch_seconds'::text AS metric,
        floor(extract(epoch FROM collector.stats_reset))::bigint::text AS numeric_value
    FROM collector
    CROSS JOIN collector_guard
    CROSS JOIN shape_guard
    WHERE collector_guard.reset_ok = 1
      AND shape_guard.count_ok = 1
    UNION ALL
    SELECT
        'meta'::text,
        'collector'::text,
        'deallocations'::text,
        collector.dealloc::numeric::text
    FROM collector
    CROSS JOIN collector_guard
    CROSS JOIN shape_guard
    WHERE collector_guard.reset_ok = 1
      AND shape_guard.count_ok = 1
    UNION ALL
    SELECT
        'meta'::text,
        'collector'::text,
        'shape_count'::text,
        shape_count.count::numeric::text
    FROM shape_count
    CROSS JOIN collector_guard
    CROSS JOIN shape_guard
    WHERE collector_guard.reset_ok = 1
      AND shape_guard.count_ok = 1
    UNION ALL
    SELECT
        'shape'::text,
        shapes.identity,
        metrics.metric,
        metrics.numeric_value
    FROM shapes
    CROSS JOIN collector_guard
    CROSS JOIN shape_guard
    CROSS JOIN LATERAL (
        VALUES
            ('statement_count'::text, shapes.statement_count::text),
            ('calls'::text, shapes.calls::text),
            ('total_exec_time_ms'::text, shapes.total_exec_time_ms::text),
            ('rows'::text, shapes.rows::text),
            ('shared_blks_read'::text, shapes.shared_blks_read::text),
            ('temp_blks_written'::text, shapes.temp_blks_written::text)
    ) AS metrics(metric, numeric_value)
    WHERE collector_guard.reset_ok = 1
      AND shape_guard.count_ok = 1
)
SELECT record_type, identity, metric, numeric_value
FROM output_rows
ORDER BY record_type, identity, metric;

ROLLBACK;
