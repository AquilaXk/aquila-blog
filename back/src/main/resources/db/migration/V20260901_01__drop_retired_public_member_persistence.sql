DO $$
DECLARE
    mismatches TEXT;
BEGIN
    SELECT string_agg(
        format('%s expected=%s actual=%s', expected.qualified_name, expected.relkind, COALESCE(actual.relkind::TEXT, 'missing')),
        ', ' ORDER BY expected.qualified_name
    )
    INTO mismatches
    FROM (
        VALUES
            ('public.member_signup_verification', 'r'),
            ('public.member_signup_verification_seq', 'S'),
            ('public.pending_oauth_signup', 'r'),
            ('public.pending_oauth_signup_seq', 'S'),
            ('public.member_privacy_request', 'r'),
            ('public.member_privacy_request_seq', 'S'),
            ('public.member_notification', 'r'),
            ('public.member_notification_seq', 'S'),
            ('public.post_comment', 'r'),
            ('public.post_comment_seq', 'S'),
            ('public.member_legal_acceptance', 'r'),
            ('public.member_legal_acceptance_seq', 'S'),
            ('public.member_account_deletion', 'r'),
            ('public.member_account_deletion_seq', 'S')
    ) AS expected(qualified_name, relkind)
    LEFT JOIN pg_class AS actual ON actual.oid = to_regclass(expected.qualified_name)
    WHERE actual.oid IS NULL OR actual.relkind::TEXT <> expected.relkind;

    IF mismatches IS NOT NULL THEN
        RAISE EXCEPTION 'retired public persistence object preflight failed: %', mismatches;
    END IF;
END
$$;

DO $$
DECLARE
    row_counts JSONB;
    total_rows BIGINT;
BEGIN
    SELECT
        jsonb_build_object(
            'member_signup_verification', signup_count,
            'pending_oauth_signup', oauth_count,
            'member_privacy_request', privacy_count,
            'member_notification', notification_count,
            'post_comment', comment_count
        ),
        signup_count + oauth_count + privacy_count + notification_count + comment_count
    INTO row_counts, total_rows
    FROM
        (SELECT count(*) AS signup_count FROM public.member_signup_verification) AS signup,
        (SELECT count(*) AS oauth_count FROM public.pending_oauth_signup) AS oauth,
        (SELECT count(*) AS privacy_count FROM public.member_privacy_request) AS privacy,
        (SELECT count(*) AS notification_count FROM public.member_notification) AS notification,
        (SELECT count(*) AS comment_count FROM public.post_comment) AS comment;

    IF total_rows <> 0 THEN
        RAISE EXCEPTION 'retired public persistence row preflight failed: %', row_counts;
    END IF;
END
$$;

DO $$
DECLARE
    dependencies TEXT;
    target_relations OID[] := ARRAY[
        to_regclass('public.member_signup_verification'),
        to_regclass('public.pending_oauth_signup'),
        to_regclass('public.member_privacy_request'),
        to_regclass('public.member_notification'),
        to_regclass('public.post_comment')
    ];
BEGIN
    SELECT string_agg(
        format('%I.%I:%I', namespace.nspname, relation.relname, constraint_row.conname),
        ', ' ORDER BY namespace.nspname, relation.relname, constraint_row.conname
    )
    INTO dependencies
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = ANY(target_relations)
      AND NOT constraint_row.conrelid = ANY(target_relations);

    IF dependencies IS NOT NULL THEN
        RAISE EXCEPTION 'retired public persistence dependency preflight failed: %', dependencies;
    END IF;
END
$$;

DROP TABLE public.member_notification;
DROP TABLE public.post_comment;
DROP TABLE public.member_privacy_request;
DROP TABLE public.pending_oauth_signup;
DROP TABLE public.member_signup_verification;

DROP SEQUENCE public.member_notification_seq;
DROP SEQUENCE public.post_comment_seq;
DROP SEQUENCE public.member_privacy_request_seq;
DROP SEQUENCE public.pending_oauth_signup_seq;
DROP SEQUENCE public.member_signup_verification_seq;

DO $$
DECLARE
    mismatches TEXT;
BEGIN
    SELECT string_agg(
        format('%s expected=%s actual=%s', expected.qualified_name, expected.relkind, COALESCE(actual.relkind::TEXT, 'missing')),
        ', ' ORDER BY expected.qualified_name
    )
    INTO mismatches
    FROM (
        VALUES
            ('public.member_legal_acceptance', 'r'),
            ('public.member_legal_acceptance_seq', 'S'),
            ('public.member_account_deletion', 'r'),
            ('public.member_account_deletion_seq', 'S')
    ) AS expected(qualified_name, relkind)
    LEFT JOIN pg_class AS actual ON actual.oid = to_regclass(expected.qualified_name)
    WHERE actual.oid IS NULL OR actual.relkind::TEXT <> expected.relkind;

    IF mismatches IS NOT NULL THEN
        RAISE EXCEPTION 'retired public persistence retained-object assertion failed: %', mismatches;
    END IF;
END
$$;
