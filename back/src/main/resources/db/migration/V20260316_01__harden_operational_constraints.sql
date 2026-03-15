DO $$
BEGIN
    IF to_regclass('public.post_like') IS NOT NULL THEN
        -- 과거 데이터에 중복 like row가 존재할 수 있어, 최소 id 1건만 남기고 정리한다.
        DELETE FROM post_like pl
        USING post_like dup
        WHERE pl.liker_id = dup.liker_id
          AND pl.post_id = dup.post_id
          AND pl.id > dup.id;

        CREATE UNIQUE INDEX IF NOT EXISTS post_like_uidx_liker_post
            ON post_like (liker_id, post_id);
    END IF;

    IF to_regclass('public.post_comment') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS post_comment_idx_subtree_active
            ON post_comment (post_id, parent_comment_id, created_at ASC, id ASC)
            WHERE deleted_at IS NULL;
    END IF;
END $$;
