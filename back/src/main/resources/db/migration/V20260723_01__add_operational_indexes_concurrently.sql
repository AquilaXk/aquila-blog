CREATE INDEX CONCURRENTLY IF NOT EXISTS member_idx_created_at_desc
    ON member (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_idx_modified_at_desc
    ON member (modified_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_listed_created_at_desc
    ON post (listed, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_listed_modified_at_desc
    ON post (listed, modified_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_author_created_at_desc
    ON post (author_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_author_modified_at_desc
    ON post (author_id, modified_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_public_listed_created_at_id_desc
    ON post (created_at DESC, id DESC)
    WHERE published IS TRUE AND listed IS TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_signup_verification_idx_email_created_at_desc
    ON member_signup_verification (email, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_notification_idx_receiver_created_at_desc
    ON member_notification (receiver_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_notification_idx_receiver_unread_created_at_desc
    ON member_notification (receiver_id, read_at, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_notification_idx_actor_id
    ON member_notification (actor_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_session_idx_member_active_recent
    ON member_session (member_id, last_authenticated_at DESC, id DESC)
    WHERE revoked_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_idx_status_next_retry_at
    ON task (status, next_retry_at ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_idx_status_modified_at
    ON task (status, modified_at ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_idx_task_type_status_next_retry_at
    ON task (task_type, status, next_retry_at ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_idx_task_type_status_modified_at
    ON task (task_type, status, modified_at ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS uploaded_file_idx_status_purge_after
    ON uploaded_file (status, purge_after ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_comment_idx_post_id
    ON post_comment (post_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_comment_idx_parent_comment_id
    ON post_comment (parent_comment_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_comment_idx_author_id
    ON post_comment (author_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_like_idx_post_id
    ON post_like (post_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_write_request_idempotency_idx_post_id
    ON post_write_request_idempotency (post_id)
    WHERE post_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_write_request_idempotency_idx_created_at
    ON post_write_request_idempotency (created_at ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_attr_idx_name_subject_id
    ON post_attr (name, subject_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_attr_idx_meta_tags_subject_id
    ON post_attr (subject_id)
    WHERE name = 'metaTagsIndex';

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_action_log_idx_primary_owner_id
    ON member_action_log (primary_owner_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_action_log_idx_secondary_owner_id
    ON member_action_log (secondary_owner_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_action_log_idx_actor_id
    ON member_action_log (actor_id);
