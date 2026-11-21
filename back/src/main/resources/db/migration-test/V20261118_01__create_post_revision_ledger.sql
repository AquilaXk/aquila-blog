-- 참조 구현: TryGhost/Ghost (MIT) & payloadcms/payload (MIT) — 게시글 리비전 원장 테이블
CREATE SEQUENCE IF NOT EXISTS post_revision_seq INCREMENT BY 50 START WITH 1;

CREATE TABLE IF NOT EXISTS post_revision (
    id BIGINT NOT NULL PRIMARY KEY DEFAULT nextval('post_revision_seq'),
    post_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_post_revision_post_id_id_desc
    ON post_revision (post_id, id DESC);
