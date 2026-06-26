CREATE SEQUENCE IF NOT EXISTS cloud_external_playback_token_seq INCREMENT BY 1 START WITH 1 MINVALUE 1;

DO $$
BEGIN
    EXECUTE 'CREATE TABLE IF NOT EXISTS cloud_external_playback_token (
        id BIGINT NOT NULL DEFAULT nextval(''cloud_external_playback_token_seq''),
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        file_id BIGINT NOT NULL,
        member_id BIGINT NOT NULL,
        purpose VARCHAR(40) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    )';
END $$;
