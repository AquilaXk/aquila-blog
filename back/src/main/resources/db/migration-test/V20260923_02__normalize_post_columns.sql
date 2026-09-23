ALTER TABLE post
    ADD COLUMN IF NOT EXISTS thumbnail VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS is_temp_draft BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS likes_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hit_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_post_published_is_temp_draft ON post (published, is_temp_draft);

DO $$
BEGIN
    IF to_regclass('public.member_attr') IS NOT NULL AND to_regclass('public.post') IS NOT NULL THEN
        UPDATE public.post p
        SET is_temp_draft = TRUE
        FROM public.member_attr ma
        WHERE ma.name = 'activeTempDraftPostId'
          AND ma.subject_id = p.author_id
          AND trim(ma.str_value) = p.id::text
          AND p.published = FALSE;
    END IF;

    IF to_regclass('public.post_attr') IS NOT NULL AND to_regclass('public.post') IS NOT NULL THEN
        UPDATE public.post p
        SET likes_count = pa.int_value
        FROM public.post_attr pa
        WHERE pa.subject_id = p.id
          AND pa.name = 'likesCount'
          AND pa.int_value IS NOT NULL;

        UPDATE public.post p
        SET hit_count = pa.int_value
        FROM public.post_attr pa
        WHERE pa.subject_id = p.id
          AND pa.name = 'hitCount'
          AND pa.int_value IS NOT NULL;
    END IF;
END $$;
