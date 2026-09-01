BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

WITH candidate_payloads AS MATERIALIZED (
    SELECT
        t.status::text AS status,
        t.payload::jsonb AS payload_document
    FROM task AS t
    WHERE t.task_type = 'post.write.side-effect'
      AND t.status IN ('PENDING', 'PROCESSING', 'FAILED')
),
decoded_candidates AS MATERIALIZED (
    SELECT
        c.status,
        CASE
            WHEN jsonb_typeof(c.payload_document -> 'schemaVersion') = 'number'
              AND c.payload_document ->> 'schemaVersion' = '1'
              AND NOT (c.payload_document ? 'payloadJson')
                THEN c.payload_document ->> 'domainEventType'
            WHEN jsonb_typeof(c.payload_document -> 'schemaVersion') = 'number'
              AND c.payload_document ->> 'schemaVersion' = '2'
              AND jsonb_typeof(c.payload_document -> 'payloadJson') = 'string'
                THEN ((c.payload_document ->> 'payloadJson')::jsonb)
                    ->> 'domainEventType'
            ELSE NULL
        END AS domain_event_type
    FROM candidate_payloads AS c
),
matching_counts AS (
    SELECT
        d.status,
        COUNT(*)::bigint AS count
    FROM decoded_candidates AS d
    WHERE d.domain_event_type =
        'com.back.boundedContexts.post.event.PostAccountDeletionDeletedEvent'
    GROUP BY d.status
),
expected_statuses(ordinal, label, status) AS (
    VALUES
        (1, 'post_account_deletion_event_pending_count', 'PENDING'),
        (2, 'post_account_deletion_event_processing_count', 'PROCESSING'),
        (3, 'post_account_deletion_event_failed_count', 'FAILED')
),
inventory_output AS (
    SELECT
        e.ordinal,
        e.label,
        COALESCE(m.count, 0::bigint) AS count
    FROM expected_statuses AS e
    LEFT JOIN matching_counts AS m ON m.status = e.status
)
SELECT inventory_output.label, inventory_output.count
FROM inventory_output
ORDER BY inventory_output.ordinal;

ROLLBACK;
