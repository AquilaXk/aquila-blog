CREATE INDEX CONCURRENTLY IF NOT EXISTS cloud_external_playback_token_idx_expires_at_id_asc
    ON cloud_external_playback_token (expires_at ASC, id ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS cloud_file_idx_owner_folder_media_created_active
    ON cloud_file (owner_member_id, folder_path, media_kind, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_idx_failed_type_modified_id_desc
    ON task (task_type ASC, modified_at DESC, id DESC)
    WHERE status = 'FAILED';

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_idx_failed_modified_id_desc
    ON task (modified_at DESC, id DESC)
    WHERE status = 'FAILED';

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_active_unlisted_modified_id_desc
    ON post (modified_at DESC, id DESC)
    WHERE deleted_at IS NULL AND published = true AND listed = false;
