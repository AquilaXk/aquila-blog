ALTER SEQUENCE IF EXISTS member_seq INCREMENT BY 50;
SELECT setval('public.member_seq', COALESCE((SELECT MAX(id) FROM public.member), 0) + 50, false);

ALTER SEQUENCE IF EXISTS member_attr_seq INCREMENT BY 50;
SELECT setval('public.member_attr_seq', COALESCE((SELECT MAX(id) FROM public.member_attr), 0) + 50, false);

ALTER SEQUENCE IF EXISTS member_notification_seq INCREMENT BY 50;
SELECT
    setval(
        'public.member_notification_seq',
        COALESCE((SELECT MAX(id) FROM public.member_notification), 0) + 50,
        false
    );

ALTER SEQUENCE IF EXISTS member_action_log_seq INCREMENT BY 50;
SELECT
    setval(
        'public.member_action_log_seq',
        COALESCE((SELECT MAX(id) FROM public.member_action_log), 0) + 50,
        false
    );

ALTER SEQUENCE IF EXISTS member_signup_verification_seq INCREMENT BY 20;
SELECT
    setval(
        'public.member_signup_verification_seq',
        COALESCE((SELECT MAX(id) FROM public.member_signup_verification), 0) + 20,
        false
    );

ALTER SEQUENCE IF EXISTS post_seq INCREMENT BY 50;
SELECT setval('public.post_seq', COALESCE((SELECT MAX(id) FROM public.post), 0) + 50, false);

ALTER SEQUENCE IF EXISTS post_attr_seq INCREMENT BY 50;
SELECT setval('public.post_attr_seq', COALESCE((SELECT MAX(id) FROM public.post_attr), 0) + 50, false);

ALTER SEQUENCE IF EXISTS post_like_seq INCREMENT BY 50;
SELECT setval('public.post_like_seq', COALESCE((SELECT MAX(id) FROM public.post_like), 0) + 50, false);

ALTER SEQUENCE IF EXISTS post_comment_seq INCREMENT BY 50;
SELECT setval('public.post_comment_seq', COALESCE((SELECT MAX(id) FROM public.post_comment), 0) + 50, false);

ALTER SEQUENCE IF EXISTS post_write_request_idempotency_seq INCREMENT BY 50;
SELECT
    setval(
        'public.post_write_request_idempotency_seq',
        COALESCE((SELECT MAX(id) FROM public.post_write_request_idempotency), 0) + 50,
        false
    );

ALTER SEQUENCE IF EXISTS task_seq INCREMENT BY 50;
SELECT setval('public.task_seq', COALESCE((SELECT MAX(id) FROM public.task), 0) + 50, false);

ALTER SEQUENCE IF EXISTS uploaded_file_seq INCREMENT BY 1;
SELECT setval('public.uploaded_file_seq', COALESCE((SELECT MAX(id) FROM public.uploaded_file), 0) + 1, false);
