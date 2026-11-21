CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_active_status_modified_at_id_desc
    ON post (published, is_temp_draft, modified_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_active_created_at_id_desc
    ON post (created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_public_listed_active_modified_at_id_desc
    ON post (modified_at DESC, id DESC)
    WHERE deleted_at IS NULL AND published IS TRUE AND listed IS TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_public_listed_author_created_at_id_desc
    ON post (author_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL AND published IS TRUE AND listed IS TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS uploaded_file_idx_object_key_pattern_id_asc
    ON uploaded_file (object_key varchar_pattern_ops, status, id ASC);
