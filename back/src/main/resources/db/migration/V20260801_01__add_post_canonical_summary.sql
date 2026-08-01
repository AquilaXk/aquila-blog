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

COMMENT ON COLUMN post.summary_text IS '작성자가 확정하거나 결정적 알고리즘으로 발췌한 canonical summary';
COMMENT ON COLUMN post.summary_source IS 'MANUAL, LEADING_BLOCK, EXTRACTED, MIGRATED, NONE';
COMMENT ON COLUMN post.summary_content_hash IS 'summary 계산 기준이 된 normalized content SHA-256';
COMMENT ON COLUMN post.summary_algorithm_version IS 'manual 또는 결정적 자동 발췌 알고리즘 버전';
COMMENT ON COLUMN post.summary_generated_at IS '자동 발췌 또는 legacy migration 계산 시각';
