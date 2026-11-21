CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_public_detail_readable_id ON post (id) WHERE deleted_at IS NULL AND published IS TRUE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_deleted_at_desc ON post (deleted_at DESC, id DESC) WHERE deleted_at IS NOT NULL;
