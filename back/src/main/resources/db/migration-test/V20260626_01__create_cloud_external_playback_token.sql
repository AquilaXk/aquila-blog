CREATE SEQUENCE IF NOT EXISTS cloud_external_playback_token_seq INCREMENT BY 1 START WITH 1 MINVALUE 1;

CREATE TABLE IF NOT EXISTS cloud_external_playback_token (
    id BIGINT NOT NULL DEFAULT nextval('cloud_external_playback_token_seq'),
    token_hash VARCHAR(64) NOT NULL,
    file_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    purpose VARCHAR(40) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_cloud_external_playback_token PRIMARY KEY (id),
    CONSTRAINT uk_cloud_external_playback_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_cloud_external_playback_token_file FOREIGN KEY (file_id) REFERENCES cloud_file (id),
    CONSTRAINT fk_cloud_external_playback_token_member FOREIGN KEY (member_id) REFERENCES member (id)
);

CREATE INDEX IF NOT EXISTS cloud_external_playback_token_idx_file_purpose_expires
    ON cloud_external_playback_token (file_id, purpose, expires_at);

CREATE INDEX IF NOT EXISTS cloud_external_playback_token_idx_member_expires
    ON cloud_external_playback_token (member_id, expires_at);
