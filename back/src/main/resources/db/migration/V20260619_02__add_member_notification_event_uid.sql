ALTER TABLE member_notification
    ADD COLUMN IF NOT EXISTS event_uid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS member_notification_idx_event_uid_unique
    ON member_notification (event_uid)
    WHERE event_uid IS NOT NULL;
