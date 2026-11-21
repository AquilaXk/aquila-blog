BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

WITH constants AS (
    SELECT
        chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) ||
        chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) ||
        chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) ||
        chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) ||
        chr(8239) || chr(8287) || chr(12288) || chr(65279) AS js_trim_chars
),
classified AS (
    SELECT
        CASE WHEN p.deleted_at IS NULL THEN 'active' ELSE 'soft_deleted' END AS lifecycle,
        CASE
            WHEN btrim(p.content, c.js_trim_chars) <> '' THEN 'markdown_present'
            ELSE 'markdown_absent'
        END AS markdown_bucket,
        CASE
            WHEN btrim(p.content_html, c.js_trim_chars) <> '' THEN 'html_present'
            ELSE 'html_absent'
        END AS html_bucket,
        CASE
            WHEN p.content_html_trust_state IS NULL THEN 'null'
            WHEN p.content_html_trust_state = 'TRUSTED_CURRENT' THEN 'TRUSTED_CURRENT'
            WHEN p.content_html_trust_state = 'UNKNOWN' THEN 'UNKNOWN'
            WHEN p.content_html_trust_state = 'REJECTED' THEN 'REJECTED'
            ELSE 'other'
        END AS trust_bucket,
        CASE
            WHEN p.content_html_sanitizer_policy_version IS NULL
                OR btrim(p.content_html_sanitizer_policy_version, c.js_trim_chars) = ''
                THEN 'null_or_blank'
            WHEN p.content_html_sanitizer_policy_version = 'content-html-v1'
                THEN 'content-html-v1'
            ELSE 'other_nonblank'
        END AS policy_bucket,
        CASE
            WHEN p.content_html IS NULL
                OR btrim(p.content_html, c.js_trim_chars) = '' THEN 'not_applicable'
            WHEN p.content_html_hash IS NULL
                OR btrim(p.content_html_hash, c.js_trim_chars) = '' THEN 'missing'
            WHEN p.content_html_hash !~ '^[0-9a-f]{64}$' THEN 'malformed'
            WHEN p.content_html_hash = encode(sha256(convert_to(p.content_html, 'UTF8')), 'hex') THEN 'valid'
            ELSE 'mismatched'
        END AS hash_bucket
    FROM post AS p
    CROSS JOIN constants AS c
),
decisions AS (
    SELECT
        *,
        markdown_bucket = 'markdown_absent'
            AND html_bucket = 'html_present'
            AND trust_bucket = 'TRUSTED_CURRENT'
            AND policy_bucket = 'content-html-v1'
            AND hash_bucket = 'valid' AS trusted_html_only,
        markdown_bucket = 'markdown_absent'
            AND html_bucket = 'html_absent' AS source_missing
    FROM classified
),
decision_totals AS (
    SELECT
        *,
        NOT trusted_html_only
            AND markdown_bucket = 'markdown_absent'
            AND html_bucket = 'html_present' AS revalidation_candidate
    FROM decisions
),
labeled AS (
    SELECT
        *,
        revalidation_candidate OR source_missing AS transition_blocker
    FROM decision_totals
),
bucket_counts AS (
    SELECT
        lifecycle,
        markdown_bucket,
        html_bucket,
        trust_bucket,
        policy_bucket,
        hash_bucket,
        COUNT(*)::bigint AS row_count
    FROM labeled
    GROUP BY lifecycle, markdown_bucket, html_bucket, trust_bucket, policy_bucket, hash_bucket
),
metrics AS (
    SELECT
        COUNT(*)::bigint AS total_rows,
        (SELECT COALESCE(SUM(row_count), 0)::bigint FROM bucket_counts) AS cross_product_total,
        COUNT(*) FILTER (WHERE lifecycle IN ('active', 'soft_deleted'))::bigint AS lifecycle_total,
        COUNT(*) FILTER (
            WHERE (markdown_bucket, html_bucket) IN (
                ('markdown_present', 'html_present'),
                ('markdown_present', 'html_absent'),
                ('markdown_absent', 'html_present'),
                ('markdown_absent', 'html_absent')
            )
        )::bigint AS presence_total,
        COUNT(*) FILTER (WHERE trusted_html_only)::bigint AS trusted_html_only_total,
        COUNT(*) FILTER (WHERE revalidation_candidate)::bigint AS revalidation_candidate_total,
        COUNT(*) FILTER (WHERE source_missing)::bigint AS source_missing_total,
        COUNT(*) FILTER (WHERE transition_blocker)::bigint AS transition_blocker_total,
        COUNT(*) FILTER (WHERE NOT transition_blocker)::bigint AS non_blocker_total,
        COUNT(*) FILTER (
            WHERE lifecycle IS NULL OR lifecycle NOT IN ('active', 'soft_deleted')
                OR markdown_bucket IS NULL
                OR markdown_bucket NOT IN ('markdown_present', 'markdown_absent')
                OR html_bucket IS NULL OR html_bucket NOT IN ('html_present', 'html_absent')
                OR trust_bucket IS NULL
                OR trust_bucket NOT IN ('TRUSTED_CURRENT', 'UNKNOWN', 'REJECTED', 'null', 'other')
                OR policy_bucket IS NULL
                OR policy_bucket NOT IN ('content-html-v1', 'other_nonblank', 'null_or_blank')
                OR hash_bucket IS NULL
                OR hash_bucket NOT IN ('not_applicable', 'missing', 'malformed', 'valid', 'mismatched')
        )::bigint AS unknown_shape_total
    FROM labeled
),
invariant_guard AS (
    SELECT
        CASE
            WHEN cross_product_total = total_rows
                AND lifecycle_total = total_rows
                AND presence_total = total_rows
                AND transition_blocker_total + non_blocker_total = total_rows
                AND unknown_shape_total = 0
                THEN 1
            ELSE 1 / (total_rows - total_rows)
        END AS passed
    FROM metrics
),
inventory_output AS (
    SELECT
        'bucket:lifecycle=' || lifecycle ||
            ',markdown=' || markdown_bucket ||
            ',html=' || html_bucket ||
            ',trust=' || trust_bucket ||
            ',policy=' || policy_bucket ||
            ',hash=' || hash_bucket AS label,
        row_count AS count
    FROM bucket_counts

    UNION ALL

    SELECT 'total:total_rows', total_rows FROM metrics
    UNION ALL
    SELECT 'total:trusted_html_only', trusted_html_only_total FROM metrics
    UNION ALL
    SELECT 'total:revalidation_candidate', revalidation_candidate_total FROM metrics
    UNION ALL
    SELECT 'total:source_missing', source_missing_total FROM metrics
    UNION ALL
    SELECT 'total:transition_blocker', transition_blocker_total FROM metrics
    UNION ALL
    SELECT 'total:non_blocker', non_blocker_total FROM metrics
)
SELECT inventory_output.label, inventory_output.count
FROM inventory_output
CROSS JOIN invariant_guard
WHERE invariant_guard.passed = 1
ORDER BY inventory_output.label;

ROLLBACK;
