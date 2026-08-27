\set ON_ERROR_STOP 1
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
