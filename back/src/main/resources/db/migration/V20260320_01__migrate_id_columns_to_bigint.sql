DO $$
BEGIN
    -- member
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'member'
          AND column_name = 'id'
          AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    -- post
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'post'
          AND column_name = 'id'
          AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post' AND column_name = 'author_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post
            ALTER COLUMN author_id TYPE BIGINT USING author_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post' AND column_name = 'likes_count_attr_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post
            ALTER COLUMN likes_count_attr_id TYPE BIGINT USING likes_count_attr_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post' AND column_name = 'comments_count_attr_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post
            ALTER COLUMN comments_count_attr_id TYPE BIGINT USING comments_count_attr_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post' AND column_name = 'hit_count_attr_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post
            ALTER COLUMN hit_count_attr_id TYPE BIGINT USING hit_count_attr_id::bigint;
    END IF;

    -- member_attr
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_attr' AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_attr
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_attr' AND column_name = 'subject_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_attr
            ALTER COLUMN subject_id TYPE BIGINT USING subject_id::bigint;
    END IF;

    -- post_attr
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_attr' AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_attr
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_attr' AND column_name = 'subject_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_attr
            ALTER COLUMN subject_id TYPE BIGINT USING subject_id::bigint;
    END IF;

    -- post_comment
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_comment' AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_comment
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_comment' AND column_name = 'author_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_comment
            ALTER COLUMN author_id TYPE BIGINT USING author_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_comment' AND column_name = 'post_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_comment
            ALTER COLUMN post_id TYPE BIGINT USING post_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_comment' AND column_name = 'parent_comment_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_comment
            ALTER COLUMN parent_comment_id TYPE BIGINT USING parent_comment_id::bigint;
    END IF;

    -- post_like
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_like' AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_like
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_like' AND column_name = 'liker_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_like
            ALTER COLUMN liker_id TYPE BIGINT USING liker_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_like' AND column_name = 'post_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_like
            ALTER COLUMN post_id TYPE BIGINT USING post_id::bigint;
    END IF;

    -- post_write_request_idempotency
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_write_request_idempotency' AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_write_request_idempotency
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_write_request_idempotency' AND column_name = 'actor_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_write_request_idempotency
            ALTER COLUMN actor_id TYPE BIGINT USING actor_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'post_write_request_idempotency' AND column_name = 'post_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.post_write_request_idempotency
            ALTER COLUMN post_id TYPE BIGINT USING post_id::bigint;
    END IF;

    -- member_action_log
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_action_log' AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_action_log
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_action_log' AND column_name = 'primary_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_action_log
            ALTER COLUMN primary_id TYPE BIGINT USING primary_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_action_log' AND column_name = 'primary_owner_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_action_log
            ALTER COLUMN primary_owner_id TYPE BIGINT USING primary_owner_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_action_log' AND column_name = 'secondary_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_action_log
            ALTER COLUMN secondary_id TYPE BIGINT USING secondary_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_action_log' AND column_name = 'secondary_owner_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_action_log
            ALTER COLUMN secondary_owner_id TYPE BIGINT USING secondary_owner_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_action_log' AND column_name = 'actor_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_action_log
            ALTER COLUMN actor_id TYPE BIGINT USING actor_id::bigint;
    END IF;

    -- member_notification
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_notification' AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_notification
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_notification' AND column_name = 'receiver_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_notification
            ALTER COLUMN receiver_id TYPE BIGINT USING receiver_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_notification' AND column_name = 'actor_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_notification
            ALTER COLUMN actor_id TYPE BIGINT USING actor_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_notification' AND column_name = 'post_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_notification
            ALTER COLUMN post_id TYPE BIGINT USING post_id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_notification' AND column_name = 'comment_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_notification
            ALTER COLUMN comment_id TYPE BIGINT USING comment_id::bigint;
    END IF;

    -- member_signup_verification
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'member_signup_verification' AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.member_signup_verification
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    -- uploaded_file
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'uploaded_file' AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.uploaded_file
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'uploaded_file' AND column_name = 'owner_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.uploaded_file
            ALTER COLUMN owner_id TYPE BIGINT USING owner_id::bigint;
    END IF;

    -- task
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'task' AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.task
            ALTER COLUMN id TYPE BIGINT USING id::bigint;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'task' AND column_name = 'aggregate_id' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.task
            ALTER COLUMN aggregate_id TYPE BIGINT USING aggregate_id::bigint;
    END IF;
END $$;
