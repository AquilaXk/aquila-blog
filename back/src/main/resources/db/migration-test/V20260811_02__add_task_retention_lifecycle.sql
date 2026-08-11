ALTER TABLE task
    ADD COLUMN payload_expires_at TIMESTAMPTZ,
    ADD COLUMN payload_purge_after TIMESTAMPTZ,
    ADD COLUMN payload_redacted_at TIMESTAMPTZ,
    ADD COLUMN row_purge_after TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION task_normalize_legacy_payload_v1_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT jsonb_exists(NEW.payload::JSONB, 'schemaVersion') THEN
        NEW.payload := task_wrap_legacy_payload_v1(
            NEW.payload,
            NEW.task_type,
            COALESCE(NEW.created_at, CURRENT_TIMESTAMP)
        );
    END IF;
    IF NEW.task_type = 'member.signupVerification.sendMail' AND NEW.payload_expires_at IS NULL THEN
        IF (NEW.payload::JSONB ->> 'schemaVersion')::INTEGER <> 1 OR
            NOT jsonb_exists(NEW.payload::JSONB, 'expiresAt') THEN
            RAISE EXCEPTION 'signup verification task payload expiry is required';
        END IF;
        NEW.payload_expires_at := (NEW.payload::JSONB ->> 'expiresAt')::TIMESTAMPTZ;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION task_apply_terminal_retention_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    terminal_at TIMESTAMPTZ;
    completed_status CONSTANT TEXT := 'COMPLETED';
    failed_status CONSTANT TEXT := 'FAILED';
    quarantined_status CONSTANT TEXT := 'QUARANTINED';
    redacted_payload CONSTANT TEXT := '{"redacted":true}';
    replay_retention CONSTANT INTERVAL := INTERVAL '7 days';
    terminal_retention CONSTANT INTERVAL := INTERVAL '30 days';
BEGIN
    terminal_at := COALESCE(NEW.modified_at, CURRENT_TIMESTAMP);
    IF NEW.status = completed_status THEN
        NEW.payload := redacted_payload;
        NEW.payload_purge_after := COALESCE(NEW.payload_purge_after, terminal_at);
        NEW.payload_redacted_at := COALESCE(NEW.payload_redacted_at, terminal_at);
        NEW.row_purge_after := COALESCE(NEW.row_purge_after, terminal_at + replay_retention);
    ELSIF NEW.status = failed_status THEN
        NEW.payload_purge_after := COALESCE(
            NEW.payload_purge_after,
            CASE
                WHEN NEW.payload_expires_at IS NULL THEN terminal_at + replay_retention
                ELSE LEAST(terminal_at + replay_retention, NEW.payload_expires_at)
            END
        );
        NEW.row_purge_after := COALESCE(NEW.row_purge_after, terminal_at + terminal_retention);
    ELSIF NEW.status = quarantined_status THEN
        NEW.payload := redacted_payload;
        NEW.payload_purge_after := COALESCE(NEW.payload_purge_after, terminal_at);
        NEW.payload_redacted_at := COALESCE(NEW.payload_redacted_at, terminal_at);
        NEW.row_purge_after := COALESCE(NEW.row_purge_after, terminal_at + terminal_retention);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER task_apply_terminal_retention_before_update
BEFORE UPDATE OF status ON task
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION task_apply_terminal_retention_defaults();

UPDATE task
SET payload_expires_at = modified_at
WHERE task_type = 'member.signupVerification.sendMail';

WITH terminal_backfill(status, retention_days) AS (
    VALUES
        ('COMPLETED', 7),
        ('QUARANTINED', 30)
)
UPDATE task
SET payload = '{"redacted":true}',
    payload_purge_after = modified_at,
    payload_redacted_at = modified_at,
    row_purge_after = modified_at + make_interval(days => terminal_backfill.retention_days)
FROM terminal_backfill
WHERE task.status = terminal_backfill.status;

UPDATE task
SET payload_purge_after =
        CASE
            WHEN payload_expires_at IS NOT NULL THEN LEAST(modified_at + make_interval(days => 7), payload_expires_at)
            ELSE modified_at + make_interval(days => 7)
        END,
    row_purge_after = modified_at + make_interval(days => 30)
WHERE status = 'FAILED';

CREATE INDEX task_idx_failed_payload_purge_after
    ON task (payload_purge_after ASC)
    WHERE payload_redacted_at IS NULL AND payload_purge_after IS NOT NULL;

CREATE INDEX task_idx_terminal_row_purge_after
    ON task (row_purge_after ASC)
    WHERE row_purge_after IS NOT NULL;
