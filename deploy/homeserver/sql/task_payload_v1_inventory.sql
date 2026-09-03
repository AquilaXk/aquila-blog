BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

WITH
current_task_types(task_type) AS (
    VALUES
        ('global.revalidate.home'),
        ('global.revalidate.post-cache-purge'),
        ('member.createActionLog'),
        ('post.hit.side-effect'),
        ('post.read.prewarm'),
        ('post.search-engine.mirror'),
        ('post.search-index.sync'),
        ('post.write.side-effect')
),
retired_known_task_types(task_type) AS (
    VALUES
        ('member.signupVerification.sendMail'),
        ('post.interaction.side-effect')
),
json_parsed AS (
    SELECT
        task.uid,
        task.aggregate_type,
        task.aggregate_id,
        task.task_type,
        task.status,
        task.execution_lease_token IS NOT NULL AS leased,
        task.payload_redacted_at IS NOT NULL AS redaction_recorded,
        CASE
            WHEN task.payload IS NOT NULL
             AND pg_input_is_valid(task.payload, 'jsonb')
                THEN task.payload::jsonb
            ELSE NULL
        END AS payload_doc
    FROM task
),
body_parsed AS (
    SELECT
        json_parsed.*,
        CASE
            WHEN jsonb_typeof(payload_doc) = 'object'
             AND jsonb_typeof(payload_doc -> 'payloadJson') = 'string'
             AND pg_input_is_valid(payload_doc ->> 'payloadJson', 'jsonb')
                THEN (payload_doc ->> 'payloadJson')::jsonb
            ELSE NULL
        END AS body_doc
    FROM json_parsed
),
classified AS (
    SELECT
        body_parsed.*,
        CASE
            WHEN payload_doc IS NULL THEN 'invalid_json'
            WHEN payload_doc = '{"redacted":true}'::jsonb THEN 'redacted'
            WHEN jsonb_typeof(payload_doc) <> 'object' THEN 'schema_less'
            WHEN NOT payload_doc ? 'schemaVersion' THEN 'schema_less'
            WHEN payload_doc -> 'schemaVersion' = '1'::jsonb
             AND NOT payload_doc ? 'payloadJson' THEN 'flat_v1'
            WHEN payload_doc -> 'schemaVersion' = '1'::jsonb THEN 'nested_v1'
            WHEN payload_doc -> 'schemaVersion' = '2'::jsonb
             AND jsonb_object_length(payload_doc) = 6
             AND payload_doc ?& ARRAY[
                 'schemaVersion',
                 'taskType',
                 'sensitivity',
                 'createdAtEpochMs',
                 'expiresAtEpochMs',
                 'payloadJson'
             ]
             AND jsonb_typeof(payload_doc -> 'taskType') = 'string'
             AND payload_doc ->> 'taskType' = task_type
             AND jsonb_typeof(payload_doc -> 'sensitivity') = 'string'
             AND payload_doc ->> 'sensitivity' IN ('PUBLIC', 'INTERNAL', 'PERSONAL', 'EXPIRING_SECRET')
             AND jsonb_typeof(payload_doc -> 'createdAtEpochMs') = 'number'
             AND (payload_doc ->> 'createdAtEpochMs') ~ '^[1-9][0-9]*$'
             AND pg_input_is_valid(payload_doc ->> 'createdAtEpochMs', 'bigint')
             AND (
                 jsonb_typeof(payload_doc -> 'expiresAtEpochMs') = 'null'
                 OR (
                     jsonb_typeof(payload_doc -> 'expiresAtEpochMs') = 'number'
                     AND (payload_doc ->> 'expiresAtEpochMs') ~ '^[1-9][0-9]*$'
                     AND pg_input_is_valid(payload_doc ->> 'expiresAtEpochMs', 'bigint')
                 )
             )
             AND jsonb_typeof(body_doc) = 'object'
             AND body_doc ->> 'uid' = uid::text
             AND body_doc ->> 'aggregateType' = aggregate_type
             AND body_doc ->> 'aggregateId' = aggregate_id::text
                THEN 'valid_v2'
            WHEN payload_doc -> 'schemaVersion' = '2'::jsonb THEN 'malformed_v2'
            ELSE 'other_schema'
        END AS payload_class
    FROM body_parsed
)
SELECT
    current_setting('transaction_read_only')::boolean AS read_only,
    (SELECT COUNT(*) FROM classified) AS total_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'invalid_json') AS invalid_json_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'redacted') AS redacted_count,
    (
        SELECT COUNT(*)
        FROM classified
        WHERE payload_class = 'redacted'
          AND (status IS NULL OR status NOT IN ('COMPLETED', 'FAILED', 'QUARANTINED'))
    ) AS redacted_nonterminal_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'redacted' AND NOT redaction_recorded) AS redacted_without_timestamp_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class <> 'redacted' AND redaction_recorded) AS nonredacted_with_timestamp_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'schema_less') AS schema_less_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1') AS flat_v1_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'nested_v1') AS nested_v1_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'valid_v2') AS valid_v2_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'malformed_v2') AS malformed_v2_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'other_schema') AS other_schema_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND status = 'PENDING') AS flat_v1_pending_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND status = 'PROCESSING') AS flat_v1_processing_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND status = 'FAILED') AS flat_v1_failed_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND status = 'COMPLETED') AS flat_v1_completed_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND status = 'QUARANTINED') AS flat_v1_quarantined_count,
    (
        SELECT COUNT(*)
        FROM classified
        WHERE payload_class = 'flat_v1'
          AND (status IS NULL OR status NOT IN ('PENDING', 'PROCESSING', 'FAILED', 'COMPLETED', 'QUARANTINED'))
    ) AS flat_v1_unknown_status_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND leased) AS flat_v1_leased_count,
    (
        SELECT COUNT(*)
        FROM classified
        WHERE payload_class = 'flat_v1'
          AND leased
          AND (status IS NULL OR status <> 'PROCESSING')
    ) AS flat_v1_nonprocessing_leased_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND task_type = 'post.write.side-effect') AS flat_v1_post_write_count,
    (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND task_type = 'post.search-index.sync') AS flat_v1_post_search_index_count,
    (
        SELECT COUNT(*)
        FROM classified
        WHERE payload_class = 'flat_v1'
          AND task_type IN (SELECT task_type FROM current_task_types)
          AND task_type NOT IN ('post.write.side-effect', 'post.search-index.sync')
    ) AS flat_v1_current_same_shape_count,
    (
        SELECT COUNT(*)
        FROM classified
        WHERE payload_class = 'flat_v1'
          AND task_type IN (SELECT task_type FROM retired_known_task_types)
    ) AS flat_v1_retired_known_count,
    (
        SELECT COUNT(*)
        FROM classified
        WHERE payload_class = 'flat_v1'
          AND (
              task_type IS NULL
              OR (
                  task_type NOT IN (SELECT task_type FROM current_task_types)
                  AND task_type NOT IN (SELECT task_type FROM retired_known_task_types)
              )
          )
    ) AS flat_v1_unknown_type_count,
    (
        SELECT COUNT(*)
        FROM classified
        WHERE payload_class <> 'redacted'
          AND (
              task_type IS NULL
              OR task_type NOT IN (SELECT task_type FROM current_task_types)
          )
    ) AS nonredacted_unknown_type_count,
    (
        (SELECT COUNT(*) FROM classified) =
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'invalid_json') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'redacted') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'schema_less') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'nested_v1') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'valid_v2') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'malformed_v2') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'other_schema')
    ) AS payload_partition_ok,
    (
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1') =
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND status = 'PENDING') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND status = 'PROCESSING') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND status = 'FAILED') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND status = 'COMPLETED') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND status = 'QUARANTINED') +
        (
            SELECT COUNT(*)
            FROM classified
            WHERE payload_class = 'flat_v1'
              AND (status IS NULL OR status NOT IN ('PENDING', 'PROCESSING', 'FAILED', 'COMPLETED', 'QUARANTINED'))
        )
    ) AS flat_v1_status_partition_ok,
    (
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1') =
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND task_type = 'post.write.side-effect') +
        (SELECT COUNT(*) FROM classified WHERE payload_class = 'flat_v1' AND task_type = 'post.search-index.sync') +
        (
            SELECT COUNT(*)
            FROM classified
            WHERE payload_class = 'flat_v1'
              AND task_type IN (SELECT task_type FROM current_task_types)
              AND task_type NOT IN ('post.write.side-effect', 'post.search-index.sync')
        ) +
        (
            SELECT COUNT(*)
            FROM classified
            WHERE payload_class = 'flat_v1'
              AND task_type IN (SELECT task_type FROM retired_known_task_types)
        ) +
        (
            SELECT COUNT(*)
            FROM classified
            WHERE payload_class = 'flat_v1'
              AND (
                  task_type IS NULL
                  OR (
                      task_type NOT IN (SELECT task_type FROM current_task_types)
                      AND task_type NOT IN (SELECT task_type FROM retired_known_task_types)
                  )
              )
        )
    ) AS flat_v1_type_partition_ok
;

ROLLBACK;
