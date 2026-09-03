BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

WITH
markers AS (
    SELECT
        subject_id,
        BTRIM(COALESCE(str_value, '')) AS marker_value
    FROM member_attr
    WHERE name = 'activeTempDraftPostId'
),
valid_active_markers AS (
    SELECT
        marker.subject_id,
        post.id AS post_id,
        post.title,
        post.listed
    FROM markers marker
    JOIN post
      ON post.author_id = marker.subject_id
     AND post.id::text = marker.marker_value
     AND post.deleted_at IS NULL
     AND post.published = FALSE
    WHERE marker.marker_value <> ''
),
invalid_nonblank_markers AS (
    SELECT marker.subject_id
    FROM markers marker
    WHERE marker.marker_value <> ''
      AND NOT EXISTS (
          SELECT 1
          FROM valid_active_markers valid_marker
          WHERE valid_marker.subject_id = marker.subject_id
      )
),
legacy_title_candidates AS (
    SELECT
        post.id AS post_id,
        post.author_id,
        post.listed
    FROM post
    WHERE post.deleted_at IS NULL
      AND post.published = FALSE
      AND post.title = '임시글'
),
tracked_legacy_title_candidates AS (
    SELECT candidate.post_id
    FROM legacy_title_candidates candidate
    JOIN valid_active_markers valid_marker
      ON valid_marker.subject_id = candidate.author_id
     AND valid_marker.post_id = candidate.post_id
),
untracked_legacy_title_candidates AS (
    SELECT
        candidate.post_id,
        candidate.author_id
    FROM legacy_title_candidates candidate
    WHERE NOT EXISTS (
        SELECT 1
        FROM valid_active_markers valid_marker
        WHERE valid_marker.subject_id = candidate.author_id
          AND valid_marker.post_id = candidate.post_id
    )
),
ambiguous_untracked_authors AS (
    SELECT candidate.author_id
    FROM untracked_legacy_title_candidates candidate
    GROUP BY candidate.author_id
    HAVING COUNT(*) > 1
),
untracked_authors_with_active_marker AS (
    SELECT DISTINCT candidate.author_id
    FROM untracked_legacy_title_candidates candidate
    JOIN valid_active_markers valid_marker
      ON valid_marker.subject_id = candidate.author_id
)
SELECT
    current_setting('transaction_read_only')::boolean AS read_only,
    (SELECT COUNT(*) FROM markers) AS marker_count,
    (SELECT COUNT(*) FROM markers WHERE marker_value = '') AS cleared_marker_count,
    (SELECT COUNT(*) FROM markers WHERE marker_value <> '') AS nonblank_marker_count,
    (SELECT COUNT(*) FROM valid_active_markers) AS valid_active_marker_count,
    (SELECT COUNT(*) FROM invalid_nonblank_markers) AS invalid_nonblank_marker_count,
    (SELECT COUNT(*) FROM legacy_title_candidates) AS legacy_title_candidate_count,
    (SELECT COUNT(*) FROM tracked_legacy_title_candidates) AS tracked_legacy_title_candidate_count,
    (SELECT COUNT(*) FROM untracked_legacy_title_candidates) AS untracked_legacy_title_candidate_count,
    (SELECT COUNT(DISTINCT author_id) FROM untracked_legacy_title_candidates) AS untracked_legacy_author_count,
    (SELECT COUNT(*) FROM ambiguous_untracked_authors) AS ambiguous_untracked_author_count,
    (SELECT COUNT(*) FROM untracked_authors_with_active_marker) AS untracked_author_with_active_marker_count,
    (SELECT COUNT(*) FROM legacy_title_candidates WHERE listed = TRUE) AS legacy_title_listed_count,
    (SELECT COUNT(*) FROM valid_active_markers WHERE title <> '임시글') AS canonical_nonlegacy_title_count,
    (SELECT COUNT(*) FROM valid_active_markers WHERE listed = TRUE) AS canonical_listed_count,
    (
        (SELECT COUNT(*) FROM markers) =
        (SELECT COUNT(*) FROM markers WHERE marker_value = '') +
        (SELECT COUNT(*) FROM valid_active_markers) +
        (SELECT COUNT(*) FROM invalid_nonblank_markers)
    ) AS marker_partition_ok,
    (
        (SELECT COUNT(*) FROM legacy_title_candidates) =
        (SELECT COUNT(*) FROM tracked_legacy_title_candidates) +
        (SELECT COUNT(*) FROM untracked_legacy_title_candidates)
    ) AS legacy_partition_ok
;

ROLLBACK;
