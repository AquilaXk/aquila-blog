-- NOTE:
-- This script intentionally avoids DO $$ ... $$ blocks because
-- Spring's SQL initializer can split statements by ';' and break
-- dollar-quoted blocks in some runtime paths.
--
-- Each statement is a plain SELECT and safe for Spring SQL init.
-- Tables/sequences are expected to exist in prod schema.

SELECT setval('public.member_seq', COALESCE((SELECT MAX(id) + 1 FROM public.member), 1), false);
SELECT setval('public.member_attr_seq', COALESCE((SELECT MAX(id) + 1 FROM public.member_attr), 1), false);
SELECT
    setval(
        'public.member_notification_seq',
        COALESCE((SELECT MAX(id) + 1 FROM public.member_notification), 1),
        false
    );
SELECT
    setval(
        'public.member_action_log_seq',
        COALESCE((SELECT MAX(id) + 1 FROM public.member_action_log), 1),
        false
    );
SELECT setval('public.post_seq', COALESCE((SELECT MAX(id) + 1 FROM public.post), 1), false);
SELECT setval('public.post_attr_seq', COALESCE((SELECT MAX(id) + 1 FROM public.post_attr), 1), false);
SELECT setval('public.post_like_seq', COALESCE((SELECT MAX(id) + 1 FROM public.post_like), 1), false);
SELECT setval('public.post_comment_seq', COALESCE((SELECT MAX(id) + 1 FROM public.post_comment), 1), false);
SELECT setval('public.task_seq', COALESCE((SELECT MAX(id) + 1 FROM public.task), 1), false);
SELECT setval('public.uploaded_file_seq', COALESCE((SELECT MAX(id) + 1 FROM public.uploaded_file), 1), false);
