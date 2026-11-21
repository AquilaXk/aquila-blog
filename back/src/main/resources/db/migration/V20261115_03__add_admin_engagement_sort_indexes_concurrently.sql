CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_active_hit_count_id_desc ON post (hit_count DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_active_likes_count_id_desc ON post (likes_count DESC, id DESC) WHERE deleted_at IS NULL;
