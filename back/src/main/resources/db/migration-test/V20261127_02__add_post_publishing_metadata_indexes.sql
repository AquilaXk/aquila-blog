-- 테스트 환경용 예약 발행·연재 시리즈·다중 임시초안 부분 복합 인덱스
CREATE INDEX IF NOT EXISTS post_idx_scheduled_publish_due
    ON post (scheduled_at ASC, id ASC)
    WHERE deleted_at IS NULL AND published = FALSE AND is_temp_draft = FALSE AND scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS post_idx_series_published_order
    ON post (series_name ASC, series_order ASC, created_at ASC, id ASC)
    WHERE deleted_at IS NULL AND published = TRUE AND listed = TRUE AND series_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS post_idx_author_temp_draft_modified
    ON post (author_id, modified_at DESC, id DESC)
    WHERE deleted_at IS NULL AND is_temp_draft = TRUE AND published = FALSE;
