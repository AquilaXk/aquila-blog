CREATE SEQUENCE IF NOT EXISTS pending_oauth_signup_seq START WITH 1 INCREMENT BY 20;

CREATE TABLE IF NOT EXISTS pending_oauth_signup (
    id BIGINT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    modified_at TIMESTAMPTZ NOT NULL,
    provider VARCHAR(32) NOT NULL,
    provider_subject_hash VARCHAR(128) NOT NULL,
    member_login_id VARCHAR(80) NOT NULL,
    pending_token_hash VARCHAR(128) NOT NULL,
    pending_token_expires_at TIMESTAMPTZ NOT NULL,
    nickname VARCHAR(30) NOT NULL,
    profile_img_url VARCHAR(2048),
    consumed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    CONSTRAINT uk_pending_oauth_signup_provider_subject_hash UNIQUE (provider, provider_subject_hash),
    CONSTRAINT uk_pending_oauth_signup_pending_token_hash UNIQUE (pending_token_hash)
);

CREATE INDEX IF NOT EXISTS pending_oauth_signup_idx_expires_at
    ON pending_oauth_signup (pending_token_expires_at);

CREATE INDEX IF NOT EXISTS pending_oauth_signup_idx_member_login_id
    ON pending_oauth_signup (member_login_id);
