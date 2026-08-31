BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

WITH active_legacy_member_emails AS (
    SELECT m.email
    FROM member AS m
    WHERE m.is_admin IS FALSE
        AND m.deleted_at IS NULL
),
normalized_email_counts AS (
    SELECT
        lower(btrim(m.email)) AS normalized_email,
        COUNT(*) AS row_count
    FROM member AS m
    WHERE m.deleted_at IS NULL
        AND m.email IS NOT NULL
    GROUP BY lower(btrim(m.email))
),
inventory_output AS (
    SELECT
        1 AS ordinal,
        'legacy_active_member_email_missing_count' AS label,
        COUNT(*)::bigint AS count
    FROM active_legacy_member_emails AS m
    WHERE m.email IS NULL

    UNION ALL

    SELECT
        2 AS ordinal,
        'legacy_active_member_email_blank_count' AS label,
        COUNT(*)::bigint AS count
    FROM active_legacy_member_emails AS m
    WHERE m.email IS NOT NULL
        AND btrim(m.email) = ''

    UNION ALL

    SELECT
        3 AS ordinal,
        'legacy_active_member_email_normalization_collision_count' AS label,
        COUNT(*)::bigint AS count
    FROM active_legacy_member_emails AS m
    JOIN normalized_email_counts ON normalized_email_counts.normalized_email = lower(btrim(m.email))
    WHERE normalized_email_counts.row_count > 1

    UNION ALL

    SELECT
        4 AS ordinal,
        'legacy_active_member_email_ineligible_count' AS label,
        COUNT(*)::bigint AS count
    FROM active_legacy_member_emails AS m
    LEFT JOIN normalized_email_counts ON normalized_email_counts.normalized_email = lower(btrim(m.email))
    WHERE m.email IS NULL
        OR btrim(m.email) = ''
        OR m.email IS DISTINCT FROM lower(btrim(m.email))
        OR char_length(m.email) > 320
        OR btrim(m.email) !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'
        OR normalized_email_counts.row_count > 1
)
SELECT inventory_output.label, inventory_output.count
FROM inventory_output
ORDER BY inventory_output.ordinal;

ROLLBACK;
