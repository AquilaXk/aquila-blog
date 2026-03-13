/*
  post_like 중복 정리 스크립트
  - (liker_id, post_id) 그룹에서 min(id) 1건만 유지
  - post_attr.likesCount를 실제 row 수 기준으로 재동기화
  - unique 제약이 없으면 추가

  실행 권장:
  - 트래픽이 낮은 시간대
  - psql -v ON_ERROR_STOP=1 -f post_like_dedup_keep_min_id.sql
*/

-- 0) 사전 점검: 현재 중복 현황
SELECT
    post_id,
    liker_id,
    COUNT(*) AS dup_count,
    MIN(id) AS keep_id,
    ARRAY_AGG(id ORDER BY id) AS like_ids
FROM post_like
GROUP BY post_id, liker_id
HAVING COUNT(*) > 1
ORDER BY dup_count DESC, post_id, liker_id;

BEGIN;

-- 좋아요 쓰기 경합 중 정리 꼬임 방지를 위해 잠금
LOCK TABLE post_like IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE post_attr IN ROW EXCLUSIVE MODE;

-- 1) min(id) 1건만 남기고 중복 삭제
WITH ranked AS (
    SELECT
        id,
        post_id,
        liker_id,
        ROW_NUMBER() OVER (
            PARTITION BY post_id, liker_id
            ORDER BY id ASC
        ) AS rn
    FROM post_like
)
DELETE FROM post_like pl
USING ranked r
WHERE pl.id = r.id
  AND r.rn > 1;

-- 2) likesCount 재동기화
WITH like_counts AS (
    SELECT
        p.id AS post_id,
        COALESCE(l.cnt, 0)::int AS likes_count
    FROM post p
    LEFT JOIN (
        SELECT post_id, COUNT(*)::int AS cnt
        FROM post_like
        GROUP BY post_id
    ) l ON l.post_id = p.id
),
updated AS (
    UPDATE post_attr pa
    SET
        int_value = lc.likes_count,
        modified_at = NOW()
    FROM like_counts lc
    WHERE pa.subject_id = lc.post_id
      AND pa.name = 'likesCount'
    RETURNING pa.subject_id
)
INSERT INTO post_attr (id, subject_id, name, int_value, str_value, created_at, modified_at)
SELECT
    NEXTVAL('post_attr_seq'),
    lc.post_id,
    'likesCount',
    lc.likes_count,
    NULL,
    NOW(),
    NOW()
FROM like_counts lc
WHERE NOT EXISTS (
    SELECT 1
    FROM post_attr pa
    WHERE pa.subject_id = lc.post_id
      AND pa.name = 'likesCount'
);

-- 3) unique 제약 보강 (없을 때만 추가)
DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conrelid = 'post_like'::regclass
          AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) LIKE '%(liker_id, post_id)%'
    ) THEN
        ALTER TABLE post_like
            ADD CONSTRAINT uq_post_like_liker_post UNIQUE (liker_id, post_id);
    END IF;
END
$$;

COMMIT;

-- 4) 사후 점검: 중복이 0건이어야 정상
SELECT
    post_id,
    liker_id,
    COUNT(*) AS dup_count
FROM post_like
GROUP BY post_id, liker_id
HAVING COUNT(*) > 1;

