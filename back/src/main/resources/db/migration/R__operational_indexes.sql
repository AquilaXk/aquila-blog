DO $$
BEGIN
    IF to_regclass('public.member') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS member_idx_created_at_desc
            ON member (created_at DESC);
        CREATE INDEX IF NOT EXISTS member_idx_modified_at_desc
            ON member (modified_at DESC);
    END IF;

    IF to_regclass('public.member') IS NOT NULL
        AND EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgroonga') THEN
        IF EXISTS(SELECT 1 FROM pg_opclass WHERE opcname = 'pgroonga_text_array_full_text_search_ops_v2') THEN
            CREATE INDEX IF NOT EXISTS member_idx_pgroonga_username_nickname
                ON member USING pgroonga ((ARRAY["username"::text, "nickname"::text])
                pgroonga_text_array_full_text_search_ops_v2) WITH (tokenizer = 'TokenBigram');
        ELSIF EXISTS(SELECT 1 FROM pg_opclass WHERE opcname = 'pgroonga_text_array_full_text_search_ops') THEN
            CREATE INDEX IF NOT EXISTS member_idx_pgroonga_username_nickname
                ON member USING pgroonga ((ARRAY["username"::text, "nickname"::text])
                pgroonga_text_array_full_text_search_ops) WITH (tokenizer = 'TokenBigram');
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.post') IS NOT NULL THEN
        ALTER TABLE IF EXISTS public.post
            ADD COLUMN IF NOT EXISTS content_html TEXT;

        CREATE INDEX IF NOT EXISTS post_idx_listed_created_at_desc
            ON post (listed, created_at DESC);
        CREATE INDEX IF NOT EXISTS post_idx_listed_modified_at_desc
            ON post (listed, modified_at DESC);
        CREATE INDEX IF NOT EXISTS post_idx_author_created_at_desc
            ON post (author_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS post_idx_author_modified_at_desc
            ON post (author_id, modified_at DESC);
    END IF;

    IF to_regclass('public.post') IS NOT NULL
        AND EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgroonga') THEN
        IF EXISTS(SELECT 1 FROM pg_opclass WHERE opcname = 'pgroonga_text_array_full_text_search_ops_v2') THEN
            CREATE INDEX IF NOT EXISTS idx_post_title_content_pgroonga
                ON post USING pgroonga ((ARRAY["title"::text, "content"::text])
                pgroonga_text_array_full_text_search_ops_v2) WITH (tokenizer = 'TokenBigram');
        ELSIF EXISTS(SELECT 1 FROM pg_opclass WHERE opcname = 'pgroonga_text_array_full_text_search_ops') THEN
            CREATE INDEX IF NOT EXISTS idx_post_title_content_pgroonga
                ON post USING pgroonga ((ARRAY["title"::text, "content"::text])
                pgroonga_text_array_full_text_search_ops) WITH (tokenizer = 'TokenBigram');
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.member_signup_verification') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS member_signup_verification_idx_email_created_at_desc
            ON member_signup_verification (email, created_at DESC);
    END IF;

    IF to_regclass('public.member_notification') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS member_notification_idx_receiver_created_at_desc
            ON member_notification (receiver_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS member_notification_idx_receiver_unread_created_at_desc
            ON member_notification (receiver_id, read_at, created_at DESC);
    END IF;

    IF to_regclass('public.task') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS task_idx_status_next_retry_at
            ON task (status, next_retry_at ASC);
    END IF;

    IF to_regclass('public.uploaded_file') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS uploaded_file_idx_status_purge_after
            ON uploaded_file (status, purge_after ASC);
    END IF;

    IF to_regclass('public.post_comment') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS post_comment_idx_subtree_active
            ON post_comment (post_id, parent_comment_id, created_at ASC, id ASC)
            WHERE deleted_at IS NULL;
    END IF;

    IF to_regclass('public.post_attr') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS post_attr_idx_name_subject_id
            ON post_attr (name, subject_id);

        CREATE INDEX IF NOT EXISTS post_attr_idx_meta_tags_subject_id
            ON post_attr (subject_id)
            WHERE name = 'metaTagsIndex';
    END IF;
END $$;
