CREATE SEQUENCE IF NOT EXISTS member_account_deletion_seq START WITH 1 INCREMENT BY 20;

CREATE TABLE IF NOT EXISTS member_account_deletion (
    id BIGINT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    modified_at TIMESTAMPTZ NOT NULL,
    member_id BIGINT NOT NULL,
    reason VARCHAR(500),
    deleted_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_member_account_deletion_member UNIQUE (member_id),
    CONSTRAINT fk_member_account_deletion_member
        FOREIGN KEY (member_id) REFERENCES member(id)
);

CREATE INDEX IF NOT EXISTS member_account_deletion_idx_deleted_at
    ON member_account_deletion (deleted_at DESC);
