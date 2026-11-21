CREATE TABLE public.platform_schema_cutover (
    cutover_id VARCHAR(100) PRIMARY KEY,
    source_sha VARCHAR(40) NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT platform_schema_cutover_source_sha_canonical
        CHECK (source_sha = lower(source_sha) AND source_sha ~ '^[0-9a-f]{40}$')
);
