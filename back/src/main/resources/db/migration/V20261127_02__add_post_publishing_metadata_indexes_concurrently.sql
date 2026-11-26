-- 무중단 인덱스 생성: 예약 발행 대기열, 시리즈 목록 정렬, 다중 임시초안 조회 부분 복합 인덱스
CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_scheduled_publish_due
    ON post (scheduled_at ASC, id ASC)
    WHERE deleted_at IS NULL AND published = FALSE AND scheduled_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_series_published_order
    ON post (series_name ASC, series_order ASC, created_at ASC, id ASC)
    WHERE deleted_at IS NULL AND published = TRUE AND listed = TRUE AND series_name IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_author_temp_draft_modified
    ON post (author_id, modified_at DESC, id DESC)
    WHERE deleted_at IS NULL AND is_temp_draft = TRUE AND published = FALSE;
