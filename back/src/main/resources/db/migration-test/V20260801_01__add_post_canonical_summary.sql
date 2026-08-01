ALTER TABLE post
    ADD COLUMN summary_text TEXT,
    ADD COLUMN summary_source VARCHAR(32) NOT NULL DEFAULT 'NONE',
    ADD COLUMN summary_content_hash VARCHAR(64),
    ADD COLUMN summary_algorithm_version VARCHAR(32),
    ADD COLUMN summary_generated_at TIMESTAMPTZ;

-- NOT VALID로 추가해 기존 행 전체 스캔 없이 신규 write부터 제약을 적용한다.
ALTER TABLE post
    ADD CONSTRAINT post_summary_source_check
    CHECK (summary_source IN ('MANUAL', 'LEADING_BLOCK', 'EXTRACTED', 'MIGRATED', 'NONE')) NOT VALID;
