CREATE SEQUENCE admin_operation_receipt_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE admin_operation_receipt (
    id BIGINT PRIMARY KEY DEFAULT nextval('admin_operation_receipt_seq'),
    operation_id UUID NOT NULL UNIQUE,
    actor_id BIGINT NOT NULL,
    session_row_id BIGINT,
    fingerprint VARCHAR(64) NOT NULL CHECK (char_length(fingerprint) = 64),
    action VARCHAR(80) NOT NULL CHECK (action = 'TASK_DLQ_REPLAY'),
    task_type VARCHAR(120) NOT NULL,
    requested_limit INTEGER NOT NULL CHECK (requested_limit BETWEEN 1 AND 200),
    reset_retry_count BOOLEAN NOT NULL,
    reason VARCHAR(200) NOT NULL CHECK (char_length(reason) > 0),
    status VARCHAR(16) NOT NULL CHECK (status IN ('ACCEPTED', 'SUCCEEDED', 'PARTIAL', 'FAILED')),
    selected_count INTEGER NOT NULL DEFAULT 0 CHECK (selected_count >= 0),
    replayed_count INTEGER NOT NULL DEFAULT 0 CHECK (replayed_count >= 0),
    quarantined_count INTEGER NOT NULL DEFAULT 0 CHECK (quarantined_count >= 0),
    result_code VARCHAR(80) CHECK (
        result_code IS NULL OR result_code IN (
            'NO_MATCHING_TASKS',
            'ALL_TASKS_QUARANTINED',
            'TASKS_REPLAYED',
            'TASKS_PARTIALLY_REPLAYED'
        )
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
