CREATE SEQUENCE IF NOT EXISTS member_legal_acceptance_seq START WITH 1 INCREMENT BY 20;

CREATE TABLE IF NOT EXISTS member_legal_acceptance (
    id BIGINT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    modified_at TIMESTAMPTZ NOT NULL,
    member_id BIGINT NOT NULL REFERENCES member(id),
    terms_version VARCHAR(32) NOT NULL,
    terms_content_sha256 VARCHAR(64) NOT NULL,
    privacy_version VARCHAR(32) NOT NULL,
    privacy_content_sha256 VARCHAR(64) NOT NULL,
    age14_or_older BOOLEAN NOT NULL,
    required_privacy_confirmed BOOLEAN NOT NULL,
    analytics_consent BOOLEAN NOT NULL,
    overseas_transfer_acknowledged BOOLEAN NOT NULL,
    source VARCHAR(32) NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS member_legal_acceptance_idx_member_accepted_at_desc
    ON member_legal_acceptance (member_id, accepted_at DESC);
