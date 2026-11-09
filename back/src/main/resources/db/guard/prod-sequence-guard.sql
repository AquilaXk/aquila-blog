-- NOTE:
-- This script intentionally avoids DO $$ ... $$ blocks because
-- Spring's SQL initializer can split statements by ';' and break
-- dollar-quoted blocks in some runtime paths.
--
-- Each statement is a plain SELECT/ALTER and safe for Spring SQL init.
-- Sequence values are aligned to allocation size, not MAX(id)+1:
-- nextval = MAX(id) + allocation_size (is_called=false).
-- This keeps pooled/pooled-lo generators from reusing existing PK ranges.

ALTER SEQUENCE IF EXISTS member_seq INCREMENT BY 50;
SELECT setval('public.member_seq', COALESCE((SELECT MAX(id) FROM public.member), 0) + 50, false);

ALTER SEQUENCE IF EXISTS member_attr_seq INCREMENT BY 50;
SELECT setval('public.member_attr_seq', COALESCE((SELECT MAX(id) FROM public.member_attr), 0) + 50, false);

ALTER SEQUENCE IF EXISTS member_action_log_seq INCREMENT BY 50;
SELECT
    setval(
        'public.member_action_log_seq',
        COALESCE((SELECT MAX(id) FROM public.member_action_log), 0) + 50,
        false
    );

ALTER SEQUENCE IF EXISTS post_seq INCREMENT BY 50;
SELECT setval('public.post_seq', COALESCE((SELECT MAX(id) FROM public.post), 0) + 50, false);

ALTER SEQUENCE IF EXISTS post_attr_seq INCREMENT BY 50;
SELECT setval('public.post_attr_seq', COALESCE((SELECT MAX(id) FROM public.post_attr), 0) + 50, false);

ALTER SEQUENCE IF EXISTS post_like_seq INCREMENT BY 50;
SELECT setval('public.post_like_seq', COALESCE((SELECT MAX(id) FROM public.post_like), 0) + 50, false);

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

ALTER SEQUENCE IF EXISTS member_session_seq INCREMENT BY 50;
SELECT setval('public.member_session_seq', COALESCE((SELECT MAX(id) FROM public.member_session), 0) + 50, false);

ALTER SEQUENCE IF EXISTS post_image_references_seq INCREMENT BY 50;
SELECT
    setval(
        'public.post_image_references_seq',
        COALESCE((SELECT MAX(id) FROM public.post_image_references), 0) + 50,
        false
    );

ALTER SEQUENCE IF EXISTS admin_operation_receipt_seq INCREMENT BY 50;
SELECT
    setval(
        'public.admin_operation_receipt_seq',
        COALESCE((SELECT MAX(id) FROM public.admin_operation_receipt), 0) + 50,
        false
    );

ALTER SEQUENCE IF EXISTS cloud_file_seq INCREMENT BY 1;
SELECT setval('public.cloud_file_seq', COALESCE((SELECT MAX(id) FROM public.cloud_file), 0) + 1, false);

ALTER SEQUENCE IF EXISTS cloud_video_upload_session_seq INCREMENT BY 1;
SELECT
    setval(
        'public.cloud_video_upload_session_seq',
        COALESCE((SELECT MAX(id) FROM public.cloud_video_upload_session), 0) + 1,
        false
    );

ALTER SEQUENCE IF EXISTS cloud_video_upload_part_seq INCREMENT BY 1;
SELECT
    setval(
        'public.cloud_video_upload_part_seq',
        COALESCE((SELECT MAX(id) FROM public.cloud_video_upload_part), 0) + 1,
        false
    );

ALTER SEQUENCE IF EXISTS cloud_external_playback_token_seq INCREMENT BY 1;
SELECT
    setval(
        'public.cloud_external_playback_token_seq',
        COALESCE((SELECT MAX(id) FROM public.cloud_external_playback_token), 0) + 1,
        false
    );
