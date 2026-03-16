DO $$
BEGIN
    IF to_regclass('public.member') IS NOT NULL AND to_regclass('public.member_seq') IS NOT NULL THEN
        PERFORM setval('public.member_seq', COALESCE((SELECT MAX(id) + 1 FROM public.member), 1), false);
    END IF;

    IF to_regclass('public.member_attr') IS NOT NULL AND to_regclass('public.member_attr_seq') IS NOT NULL THEN
        PERFORM setval('public.member_attr_seq', COALESCE((SELECT MAX(id) + 1 FROM public.member_attr), 1), false);
    END IF;

    IF to_regclass('public.member_notification') IS NOT NULL AND to_regclass('public.member_notification_seq') IS NOT NULL THEN
        PERFORM setval(
            'public.member_notification_seq',
            COALESCE((SELECT MAX(id) + 1 FROM public.member_notification), 1),
            false
        );
    END IF;

    IF to_regclass('public.member_action_log') IS NOT NULL AND to_regclass('public.member_action_log_seq') IS NOT NULL THEN
        PERFORM setval(
            'public.member_action_log_seq',
            COALESCE((SELECT MAX(id) + 1 FROM public.member_action_log), 1),
            false
        );
    END IF;

    IF to_regclass('public.post') IS NOT NULL AND to_regclass('public.post_seq') IS NOT NULL THEN
        PERFORM setval('public.post_seq', COALESCE((SELECT MAX(id) + 1 FROM public.post), 1), false);
    END IF;

    IF to_regclass('public.post_attr') IS NOT NULL AND to_regclass('public.post_attr_seq') IS NOT NULL THEN
        PERFORM setval('public.post_attr_seq', COALESCE((SELECT MAX(id) + 1 FROM public.post_attr), 1), false);
    END IF;

    IF to_regclass('public.post_like') IS NOT NULL AND to_regclass('public.post_like_seq') IS NOT NULL THEN
        PERFORM setval('public.post_like_seq', COALESCE((SELECT MAX(id) + 1 FROM public.post_like), 1), false);
    END IF;

    IF to_regclass('public.post_comment') IS NOT NULL AND to_regclass('public.post_comment_seq') IS NOT NULL THEN
        PERFORM setval(
            'public.post_comment_seq',
            COALESCE((SELECT MAX(id) + 1 FROM public.post_comment), 1),
            false
        );
    END IF;

    IF to_regclass('public.task') IS NOT NULL AND to_regclass('public.task_seq') IS NOT NULL THEN
        PERFORM setval('public.task_seq', COALESCE((SELECT MAX(id) + 1 FROM public.task), 1), false);
    END IF;

    IF to_regclass('public.uploaded_file') IS NOT NULL AND to_regclass('public.uploaded_file_seq') IS NOT NULL THEN
        PERFORM setval(
            'public.uploaded_file_seq',
            COALESCE((SELECT MAX(id) + 1 FROM public.uploaded_file), 1),
            false
        );
    END IF;
END $$;
