BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

WITH inventory_output AS (
    SELECT
        1 AS ordinal,
        'legacy_active_member_count' AS label,
        COUNT(*)::bigint AS count
    FROM member AS m
    WHERE m.is_admin IS FALSE
        AND m.deleted_at IS NULL

    UNION ALL

    SELECT
        2 AS ordinal,
        'legacy_active_session_count' AS label,
        COUNT(*)::bigint AS count
    FROM member_session AS ms
    JOIN member AS m ON ms.member_id = m.id
    WHERE m.is_admin IS FALSE
        AND m.deleted_at IS NULL
        AND ms.revoked_at IS NULL
)
SELECT inventory_output.label, inventory_output.count
FROM inventory_output
ORDER BY inventory_output.ordinal;

ROLLBACK;
