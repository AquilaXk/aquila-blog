CREATE TABLE IF NOT EXISTS auth_security_event (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    modified_at TIMESTAMPTZ NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    member_id BIGINT NULL,
    login_identifier VARCHAR(320),
    remember_login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ip_security_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    client_ip_fingerprint VARCHAR(96),
    request_path VARCHAR(255),
    reason VARCHAR(160)
);

CREATE INDEX IF NOT EXISTS idx_auth_security_event_created_at
    ON auth_security_event (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_security_event_event_type_created_at
    ON auth_security_event (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_security_event_member_created_at
    ON auth_security_event (member_id, created_at DESC);

