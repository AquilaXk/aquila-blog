ALTER TABLE cloud_video_upload_part
    ADD COLUMN IF NOT EXISTS part_sha256 VARCHAR(64) NOT NULL DEFAULT '';

ALTER TABLE cloud_video_upload_part
    ALTER COLUMN part_sha256 DROP DEFAULT;
