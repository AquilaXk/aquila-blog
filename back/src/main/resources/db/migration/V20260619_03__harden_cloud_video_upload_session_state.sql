ALTER TABLE cloud_video_upload_session
    ALTER COLUMN upload_id DROP NOT NULL;

ALTER TABLE cloud_video_upload_session
    ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(500);
