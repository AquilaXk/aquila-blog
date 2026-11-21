CREATE SEQUENCE IF NOT EXISTS member_privacy_request_seq START WITH 1 INCREMENT BY 20;

CREATE TABLE IF NOT EXISTS member_privacy_request (
    id BIGINT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    modified_at TIMESTAMPTZ NOT NULL,
    member_id BIGINT NOT NULL,
    type VARCHAR(48) NOT NULL,
    status VARCHAR(32) NOT NULL,
    message VARCHAR(1000),
    requested_at TIMESTAMPTZ NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    CONSTRAINT chk_member_privacy_request_due_at
        CHECK (due_at >= requested_at),
    CONSTRAINT chk_member_privacy_request_completed_at
        CHECK (completed_at IS NULL OR completed_at >= requested_at),
    CONSTRAINT fk_member_privacy_request_member
        FOREIGN KEY (member_id) REFERENCES member(id)
);

CREATE INDEX IF NOT EXISTS member_privacy_request_idx_member_requested_at
    ON member_privacy_request (member_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS member_privacy_request_idx_status_due_at
    ON member_privacy_request (status, due_at);
