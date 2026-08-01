ALTER TABLE post
    ADD COLUMN summary_text TEXT,
    ADD COLUMN summary_source VARCHAR(32) NOT NULL DEFAULT 'NONE',
    ADD COLUMN summary_content_hash VARCHAR(64),
    ADD COLUMN summary_algorithm_version VARCHAR(32),
    ADD COLUMN summary_generated_at TIMESTAMPTZ;

ALTER TABLE post
    ADD CONSTRAINT post_summary_source_check
    CHECK (summary_source IN ('MANUAL', 'LEADING_BLOCK', 'EXTRACTED', 'MIGRATED', 'NONE'));
