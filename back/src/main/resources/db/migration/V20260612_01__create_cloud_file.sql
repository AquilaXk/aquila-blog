CREATE SEQUENCE IF NOT EXISTS cloud_file_seq INCREMENT BY 1 START WITH 1 MINVALUE 1;

CREATE TABLE IF NOT EXISTS cloud_file (
    id BIGINT NOT NULL DEFAULT nextval('cloud_file_seq'),
    owner_member_id BIGINT NOT NULL,
    object_key VARCHAR(1000) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(120) NOT NULL,
    byte_size BIGINT NOT NULL,
    media_kind VARCHAR(40) NOT NULL,
    folder_path VARCHAR(500) NOT NULL DEFAULT '',
    checksum_sha256 VARCHAR(128),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_cloud_file PRIMARY KEY (id),
    CONSTRAINT uk_cloud_file_object_key UNIQUE (object_key),
    CONSTRAINT fk_cloud_file_owner FOREIGN KEY (owner_member_id) REFERENCES member (id)
);

CREATE INDEX IF NOT EXISTS cloud_file_idx_owner_folder_created_active
    ON cloud_file (owner_member_id, folder_path, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS cloud_file_idx_owner_media_created_active
    ON cloud_file (owner_member_id, media_kind, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
