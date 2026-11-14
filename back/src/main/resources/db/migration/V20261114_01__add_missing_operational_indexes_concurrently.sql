CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_public_listed_active_created_at_id_desc
    ON post (created_at DESC, id DESC)
    WHERE deleted_at IS NULL AND published IS TRUE AND listed IS TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_public_listed_active_hit_count_id_desc
    ON post (hit_count DESC, id DESC)
    WHERE deleted_at IS NULL AND published IS TRUE AND listed IS TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_public_listed_active_likes_count_id_desc
    ON post (likes_count DESC, id DESC)
    WHERE deleted_at IS NULL AND published IS TRUE AND listed IS TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_active_modified_at_id_desc
    ON post (modified_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_tag_index_idx_tag_lower_post_id
    ON post_tag_index (LOWER(tag), post_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_attr_idx_name_modified_at_desc
    ON post_attr (name, modified_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_session_idx_revoked_at_id_asc
    ON member_session (revoked_at ASC, id ASC)
    WHERE revoked_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS cloud_file_idx_owner_active_created_id_desc
    ON cloud_file (owner_member_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS cloud_file_idx_active_object_key_pattern
    ON cloud_file (object_key varchar_pattern_ops)
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS cloud_video_upload_session_idx_status_modified_id
    ON cloud_video_upload_session (status, modified_at ASC, id ASC);
