CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE SEQUENCE IF NOT EXISTS member_seq INCREMENT BY 50 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS member_attr_seq INCREMENT BY 50 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS member_action_log_seq INCREMENT BY 50 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS member_notification_seq INCREMENT BY 50 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS member_signup_verification_seq INCREMENT BY 20 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS post_seq INCREMENT BY 50 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS post_attr_seq INCREMENT BY 50 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS post_comment_seq INCREMENT BY 50 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS post_like_seq INCREMENT BY 50 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS post_write_request_idempotency_seq INCREMENT BY 50 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS uploaded_file_seq INCREMENT BY 50 START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS task_seq INCREMENT BY 50 START WITH 1 MINVALUE 1;

CREATE TABLE IF NOT EXISTS member (
    id INT NOT NULL DEFAULT nextval('member_seq'),
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255),
    nickname VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    api_key VARCHAR(255) NOT NULL,
    deleted_at TIMESTAMPTZ,
    profile_img_url TEXT,
    profile_title VARCHAR(255),
    profile_name VARCHAR(255),
    profile_resume TEXT,
    profile_location VARCHAR(255),
    profile_email VARCHAR(255),
    profile_phone_number VARCHAR(255),
    profile_github_url TEXT,
    profile_linkedin_url TEXT,
    profile_website_url TEXT,
    profile_discord_url TEXT,
    profile_links_json TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_member PRIMARY KEY (id),
    CONSTRAINT uk_member_username UNIQUE (username),
    CONSTRAINT uk_member_email UNIQUE (email),
    CONSTRAINT uk_member_api_key UNIQUE (api_key)
);

CREATE TABLE IF NOT EXISTS post (
    id INT NOT NULL DEFAULT nextval('post_seq'),
    author_id INT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    version BIGINT,
    published BOOLEAN NOT NULL DEFAULT false,
    listed BOOLEAN NOT NULL DEFAULT false,
    content_html TEXT,
    deleted_at TIMESTAMPTZ,
    likes_count_attr_id INT UNIQUE,
    comments_count_attr_id INT UNIQUE,
    hit_count_attr_id INT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_post PRIMARY KEY (id),
    CONSTRAINT fk_post_author FOREIGN KEY (author_id) REFERENCES member (id)
);

CREATE TABLE IF NOT EXISTS member_attr (
    id INT NOT NULL DEFAULT nextval('member_attr_seq'),
    subject_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    int_value INT,
    str_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_member_attr PRIMARY KEY (id),
    CONSTRAINT fk_member_attr_subject FOREIGN KEY (subject_id) REFERENCES member (id),
    CONSTRAINT uk_member_attr_subject_name UNIQUE (subject_id, name)
);

CREATE TABLE IF NOT EXISTS post_attr (
    id INT NOT NULL DEFAULT nextval('post_attr_seq'),
    subject_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    int_value INT,
    str_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_post_attr PRIMARY KEY (id),
    CONSTRAINT fk_post_attr_subject FOREIGN KEY (subject_id) REFERENCES post (id),
    CONSTRAINT uk_post_attr_subject_name UNIQUE (subject_id, name)
);

CREATE TABLE IF NOT EXISTS post_comment (
    id INT NOT NULL DEFAULT nextval('post_comment_seq'),
    author_id INT NOT NULL,
    post_id INT NOT NULL,
    content VARCHAR(255) NOT NULL,
    parent_comment_id INT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_post_comment PRIMARY KEY (id),
    CONSTRAINT fk_post_comment_author FOREIGN KEY (author_id) REFERENCES member (id),
    CONSTRAINT fk_post_comment_post FOREIGN KEY (post_id) REFERENCES post (id),
    CONSTRAINT fk_post_comment_parent FOREIGN KEY (parent_comment_id) REFERENCES post_comment (id)
);

CREATE TABLE IF NOT EXISTS post_like (
    id INT NOT NULL DEFAULT nextval('post_like_seq'),
    liker_id INT NOT NULL,
    post_id INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_post_like PRIMARY KEY (id),
    CONSTRAINT fk_post_like_liker FOREIGN KEY (liker_id) REFERENCES member (id),
    CONSTRAINT fk_post_like_post FOREIGN KEY (post_id) REFERENCES post (id),
    CONSTRAINT uk_post_like_liker_post UNIQUE (liker_id, post_id)
);

CREATE TABLE IF NOT EXISTS post_write_request_idempotency (
    id INT NOT NULL DEFAULT nextval('post_write_request_idempotency_seq'),
    actor_id INT NOT NULL,
    request_key VARCHAR(120) NOT NULL,
    post_id INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_post_write_request_idempotency PRIMARY KEY (id),
    CONSTRAINT fk_post_write_request_idempotency_actor FOREIGN KEY (actor_id) REFERENCES member (id),
    CONSTRAINT uk_post_write_request_idempotency_actor_key UNIQUE (actor_id, request_key)
);

CREATE TABLE IF NOT EXISTS member_action_log (
    id INT NOT NULL DEFAULT nextval('member_action_log_seq'),
    type VARCHAR(255) NOT NULL,
    primary_type VARCHAR(255) NOT NULL,
    primary_id INT NOT NULL,
    primary_owner_id INT NOT NULL,
    secondary_type VARCHAR(255) NOT NULL,
    secondary_id INT NOT NULL,
    secondary_owner_id INT NOT NULL,
    actor_id INT NOT NULL,
    data TEXT NOT NULL,
    CONSTRAINT pk_member_action_log PRIMARY KEY (id),
    CONSTRAINT fk_member_action_log_primary_owner FOREIGN KEY (primary_owner_id) REFERENCES member (id),
    CONSTRAINT fk_member_action_log_secondary_owner FOREIGN KEY (secondary_owner_id) REFERENCES member (id),
    CONSTRAINT fk_member_action_log_actor FOREIGN KEY (actor_id) REFERENCES member (id)
);

CREATE TABLE IF NOT EXISTS member_notification (
    id INT NOT NULL DEFAULT nextval('member_notification_seq'),
    receiver_id INT NOT NULL,
    actor_id INT NOT NULL,
    type VARCHAR(40) NOT NULL,
    post_id INT NOT NULL,
    comment_id INT NOT NULL,
    post_title VARCHAR(160) NOT NULL,
    comment_preview VARCHAR(240) NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_member_notification PRIMARY KEY (id),
    CONSTRAINT fk_member_notification_receiver FOREIGN KEY (receiver_id) REFERENCES member (id),
    CONSTRAINT fk_member_notification_actor FOREIGN KEY (actor_id) REFERENCES member (id)
);

CREATE TABLE IF NOT EXISTS member_signup_verification (
    id INT NOT NULL DEFAULT nextval('member_signup_verification_seq'),
    email VARCHAR(255) NOT NULL,
    email_verification_token VARCHAR(120) NOT NULL,
    email_verification_expires_at TIMESTAMPTZ NOT NULL,
    signup_session_token VARCHAR(120),
    signup_session_expires_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_member_signup_verification PRIMARY KEY (id),
    CONSTRAINT uk_member_signup_verification_email_verification_token UNIQUE (email_verification_token),
    CONSTRAINT uk_member_signup_verification_signup_session_token UNIQUE (signup_session_token)
);

CREATE TABLE IF NOT EXISTS uploaded_file (
    id INT NOT NULL DEFAULT nextval('uploaded_file_seq'),
    object_key VARCHAR(1000) NOT NULL,
    bucket VARCHAR(120) NOT NULL,
    content_type VARCHAR(120) NOT NULL,
    file_size BIGINT NOT NULL,
    purpose VARCHAR(40) NOT NULL,
    status VARCHAR(40) NOT NULL,
    owner_type VARCHAR(40),
    owner_id INT,
    retention_reason VARCHAR(40),
    purge_after TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_uploaded_file PRIMARY KEY (id),
    CONSTRAINT uk_uploaded_file_object_key UNIQUE (object_key)
);

CREATE TABLE IF NOT EXISTS task (
    id INT NOT NULL DEFAULT nextval('task_seq'),
    uid UUID UNIQUE,
    aggregate_type VARCHAR(255) NOT NULL,
    aggregate_id INT NOT NULL,
    task_type VARCHAR(255) NOT NULL,
    payload TEXT NOT NULL,
    status VARCHAR(255) NOT NULL,
    retry_count INT NOT NULL,
    max_retries INT NOT NULL,
    next_retry_at TIMESTAMPTZ NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_task PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS member_idx_created_at_desc
    ON member (created_at DESC);
CREATE INDEX IF NOT EXISTS member_idx_modified_at_desc
    ON member (modified_at DESC);
CREATE INDEX IF NOT EXISTS member_idx_pgroonga_username_nickname
    ON member USING pgroonga ((ARRAY["username"::text, "nickname"::text])
    pgroonga_text_array_full_text_search_ops_v2) WITH (tokenizer = 'TokenBigram');

CREATE INDEX IF NOT EXISTS post_idx_listed_created_at_desc
    ON post (listed, created_at DESC);
CREATE INDEX IF NOT EXISTS post_idx_published_listed_created_at_desc
    ON post (published, listed, created_at DESC);
CREATE INDEX IF NOT EXISTS post_idx_listed_modified_at_desc
    ON post (listed, modified_at DESC);
CREATE INDEX IF NOT EXISTS post_idx_author_created_at_desc
    ON post (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS post_idx_author_modified_at_desc
    ON post (author_id, modified_at DESC);
CREATE INDEX IF NOT EXISTS post_idx_deleted_at_desc
    ON post (deleted_at DESC, id DESC)
    WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_title_content_pgroonga
    ON post USING pgroonga ((ARRAY["title"::text, "content"::text])
    pgroonga_text_array_full_text_search_ops_v2) WITH (tokenizer = 'TokenBigram');

CREATE INDEX IF NOT EXISTS post_comment_idx_subtree_active
    ON post_comment (post_id, parent_comment_id, created_at ASC, id ASC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS post_like_uidx_liker_post
    ON post_like (liker_id, post_id);

CREATE INDEX IF NOT EXISTS member_notification_idx_receiver_created_at_desc
    ON member_notification (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS member_notification_idx_receiver_unread_created_at_desc
    ON member_notification (receiver_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS member_notification_idx_receiver_id_asc
    ON member_notification (receiver_id, id ASC);

CREATE INDEX IF NOT EXISTS member_signup_verification_idx_email_created_at_desc
    ON member_signup_verification (email, created_at DESC);

CREATE INDEX IF NOT EXISTS task_idx_status_next_retry_at
    ON task (status, next_retry_at ASC);

CREATE INDEX IF NOT EXISTS uploaded_file_idx_status_purge_after
    ON uploaded_file (status, purge_after ASC);
