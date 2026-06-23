ALTER TABLE member_action_log
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE member_action_log
    ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ;

-- Legacy action logs have no event timestamp source. Treat them as old data so
-- the retention cleanup can remove privacy-sensitive history promptly.
UPDATE member_action_log
SET created_at = TIMESTAMPTZ '1970-01-01 00:00:00+00'
WHERE created_at IS NULL;

UPDATE member_action_log
SET modified_at = created_at
WHERE modified_at IS NULL;

ALTER TABLE member_action_log
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN modified_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN modified_at SET NOT NULL;
