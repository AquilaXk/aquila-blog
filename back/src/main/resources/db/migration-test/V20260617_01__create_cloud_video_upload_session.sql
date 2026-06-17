CREATE SEQUENCE IF NOT EXISTS cloud_video_upload_session_seq INCREMENT BY 1 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS cloud_video_upload_part_seq INCREMENT BY 1 START WITH 1 MINVALUE 1;

CREATE TABLE IF NOT EXISTS cloud_video_upload_session (
    id BIGINT NOT NULL DEFAULT nextval('cloud_video_upload_session_seq'),
    owner_member_id BIGINT NOT NULL,
    object_key VARCHAR(1000) NOT NULL,
    upload_id VARCHAR(512) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(120) NOT NULL,
    byte_size BIGINT NOT NULL,
    folder_path VARCHAR(500) NOT NULL DEFAULT '',
    part_size_bytes BIGINT NOT NULL,
    total_parts INT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(40) NOT NULL,
    completed_file_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_cloud_video_upload_session PRIMARY KEY (id),
    CONSTRAINT uk_cloud_video_upload_session_object_key UNIQUE (object_key),
    CONSTRAINT fk_cloud_video_upload_session_owner FOREIGN KEY (owner_member_id) REFERENCES member (id),
    CONSTRAINT fk_cloud_video_upload_session_completed_file FOREIGN KEY (completed_file_id) REFERENCES cloud_file (id)
);

CREATE TABLE IF NOT EXISTS cloud_video_upload_part (
    id BIGINT NOT NULL DEFAULT nextval('cloud_video_upload_part_seq'),
    session_id BIGINT NOT NULL,
    part_number INT NOT NULL,
    e_tag VARCHAR(255) NOT NULL,
    byte_size BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_cloud_video_upload_part PRIMARY KEY (id),
    CONSTRAINT fk_cloud_video_upload_part_session FOREIGN KEY (session_id) REFERENCES cloud_video_upload_session (id),
    CONSTRAINT uk_cloud_video_upload_part_session_number UNIQUE (session_id, part_number)
);

CREATE INDEX IF NOT EXISTS cloud_video_upload_session_idx_owner_status_expires
    ON cloud_video_upload_session (owner_member_id, status, expires_at, id);

CREATE INDEX IF NOT EXISTS cloud_video_upload_session_idx_status_expires
    ON cloud_video_upload_session (status, expires_at, id);

CREATE INDEX IF NOT EXISTS cloud_video_upload_part_idx_session
    ON cloud_video_upload_part (session_id, part_number);
