DO $$
BEGIN
    IF to_regclass('public.member') IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'member'
          AND column_name = 'username'
    ) AND NOT EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'member'
          AND column_name = 'login_id'
    ) THEN
        ALTER TABLE public.member RENAME COLUMN username TO login_id;
    END IF;

    IF EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'member'
          AND column_name = 'login_id'
    ) THEN
        ALTER TABLE public.member
            ALTER COLUMN login_id SET NOT NULL;
    END IF;

    IF EXISTS(
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uk_member_username'
          AND conrelid = 'public.member'::regclass
    ) THEN
        ALTER TABLE public.member
            RENAME CONSTRAINT uk_member_username TO uk_member_login_id;
    END IF;

    IF NOT EXISTS(
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uk_member_login_id'
          AND conrelid = 'public.member'::regclass
    ) THEN
        ALTER TABLE public.member
            ADD CONSTRAINT uk_member_login_id UNIQUE (login_id);
    END IF;
END $$;

DROP INDEX IF EXISTS public.member_idx_pgroonga_username_nickname;

DO $$
BEGIN
    IF to_regclass('public.member') IS NULL
        OR NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgroonga') THEN
        RETURN;
    END IF;

    IF EXISTS(SELECT 1 FROM pg_opclass WHERE opcname = 'pgroonga_text_array_full_text_search_ops_v2') THEN
        CREATE INDEX IF NOT EXISTS member_idx_pgroonga_login_id_nickname
            ON member USING pgroonga ((ARRAY["login_id"::text, "nickname"::text])
            pgroonga_text_array_full_text_search_ops_v2) WITH (tokenizer = 'TokenBigram');
    ELSIF EXISTS(SELECT 1 FROM pg_opclass WHERE opcname = 'pgroonga_text_array_full_text_search_ops') THEN
        CREATE INDEX IF NOT EXISTS member_idx_pgroonga_login_id_nickname
            ON member USING pgroonga ((ARRAY["login_id"::text, "nickname"::text])
            pgroonga_text_array_full_text_search_ops) WITH (tokenizer = 'TokenBigram');
    END IF;
END $$;
