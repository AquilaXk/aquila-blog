ALTER TABLE task
    ADD COLUMN payload_expires_at TIMESTAMPTZ,
    ADD COLUMN payload_purge_after TIMESTAMPTZ,
    ADD COLUMN payload_redacted_at TIMESTAMPTZ,
    ADD COLUMN row_purge_after TIMESTAMPTZ;

UPDATE task
SET payload_expires_at = modified_at
WHERE task_type = 'member.signupVerification.sendMail';

UPDATE task
SET payload = '{"redacted":true}',
    payload_purge_after = modified_at,
    payload_redacted_at = modified_at,
    row_purge_after = modified_at + INTERVAL '7 days'
WHERE status = 'COMPLETED';

UPDATE task
SET payload_purge_after =
        CASE
            WHEN payload_expires_at IS NOT NULL THEN LEAST(modified_at + INTERVAL '7 days', payload_expires_at)
            ELSE modified_at + INTERVAL '7 days'
        END,
    row_purge_after = modified_at + INTERVAL '30 days'
WHERE status = 'FAILED';

UPDATE task
SET payload = '{"redacted":true}',
    payload_purge_after = modified_at,
    payload_redacted_at = modified_at,
    row_purge_after = modified_at + INTERVAL '30 days'
WHERE status = 'QUARANTINED';

CREATE INDEX task_idx_failed_payload_purge_after
    ON task (payload_purge_after ASC)
    WHERE status = 'FAILED' AND payload_redacted_at IS NULL;

CREATE INDEX task_idx_terminal_row_purge_after
    ON task (row_purge_after ASC)
    WHERE status IN ('COMPLETED', 'FAILED', 'QUARANTINED');
