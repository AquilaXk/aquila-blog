ALTER TABLE admin_operation_receipt
    ADD COLUMN control_key VARCHAR(80),
    ADD COLUMN control_value VARCHAR(16),
    ADD COLUMN control_version BIGINT;

ALTER TABLE admin_operation_receipt
    ALTER COLUMN task_type DROP NOT NULL,
    ALTER COLUMN requested_limit DROP NOT NULL,
    ALTER COLUMN reset_retry_count DROP NOT NULL;

ALTER TABLE admin_operation_receipt
    DROP CONSTRAINT admin_operation_receipt_action_check,
    DROP CONSTRAINT admin_operation_receipt_result_code_check;

ALTER TABLE admin_operation_receipt
    ADD CONSTRAINT admin_operation_receipt_action_valid_check
        CHECK (action IN ('TASK_DLQ_REPLAY', 'SEARCH_PIPELINE_FORCE_CONTROL', 'SEARCH_ENGINE_MIRROR_FORCE_DISABLE')),
    ADD CONSTRAINT admin_operation_receipt_result_code_valid_check
        CHECK (result_code IS NULL OR result_code IN (
            'NO_MATCHING_TASKS',
            'ALL_TASKS_QUARANTINED',
            'TASKS_REPLAYED',
            'TASKS_PARTIALLY_REPLAYED',
            'SEARCH_PIPELINE_FORCE_CONTROL_UPDATED',
            'SEARCH_ENGINE_MIRROR_FORCE_DISABLE_UPDATED'
        )),
    ADD CONSTRAINT admin_operation_receipt_command_shape_check
        CHECK ((
            (
                action = 'TASK_DLQ_REPLAY' AND
                task_type IS NOT NULL AND requested_limit IS NOT NULL AND reset_retry_count IS NOT NULL AND
                control_key IS NULL AND control_value IS NULL AND control_version IS NULL
            ) OR
            (
                action = 'SEARCH_PIPELINE_FORCE_CONTROL' AND
                task_type IS NULL AND requested_limit IS NULL AND reset_retry_count IS NULL AND
                control_key = 'PIPELINE_FORCE_CONTROL' AND control_value IN ('UNSET', 'ENABLED', 'DISABLED') AND
                ((status = 'ACCEPTED' AND result_code IS NULL AND control_version IS NULL) OR
                 (status = 'SUCCEEDED' AND result_code = 'SEARCH_PIPELINE_FORCE_CONTROL_UPDATED' AND control_version >= 1))
            ) OR
            (
                action = 'SEARCH_ENGINE_MIRROR_FORCE_DISABLE' AND
                task_type IS NULL AND requested_limit IS NULL AND reset_retry_count IS NULL AND
                control_key = 'MIRROR_FORCE_DISABLE' AND control_value IN ('ENABLED', 'DISABLED') AND
                ((status = 'ACCEPTED' AND result_code IS NULL AND control_version IS NULL) OR
                 (status = 'SUCCEEDED' AND result_code = 'SEARCH_ENGINE_MIRROR_FORCE_DISABLE_UPDATED' AND control_version >= 1))
            )
        ) IS TRUE);

CREATE TABLE search_runtime_control_state (
    control_key VARCHAR(80) PRIMARY KEY,
    control_value VARCHAR(16) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    applied_operation_id UUID REFERENCES admin_operation_receipt(operation_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT search_runtime_control_state_key_check
        CHECK (control_key IN ('PIPELINE_FORCE_CONTROL', 'MIRROR_FORCE_DISABLE')),
    CONSTRAINT search_runtime_control_state_value_check
        CHECK (control_value IN ('UNSET', 'ENABLED', 'DISABLED')),
    CONSTRAINT search_runtime_control_state_mirror_value_check
        CHECK (control_key <> 'MIRROR_FORCE_DISABLE' OR control_value <> 'UNSET'),
    CONSTRAINT search_runtime_control_state_version_check
        CHECK (version >= 0)
);

INSERT INTO search_runtime_control_state (control_key, control_value, version)
VALUES
    ('PIPELINE_FORCE_CONTROL', 'UNSET', 0),
    ('MIRROR_FORCE_DISABLE', 'ENABLED', 0);
