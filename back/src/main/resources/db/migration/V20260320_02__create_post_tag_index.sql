CREATE TABLE IF NOT EXISTS post_tag_index (
    post_id BIGINT NOT NULL,
    tag VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_post_tag_index PRIMARY KEY (post_id, tag),
    CONSTRAINT fk_post_tag_index_post FOREIGN KEY (post_id) REFERENCES post (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS post_tag_index_idx_tag ON post_tag_index (tag);
CREATE INDEX IF NOT EXISTS post_tag_index_idx_tag_lower ON post_tag_index (LOWER(tag));

INSERT INTO post_tag_index (post_id, tag)
SELECT DISTINCT
    p.id AS post_id,
    tokens.tag AS tag
FROM post p
JOIN post_attr pa
    ON pa.subject_id = p.id
   AND pa.name = 'metaTagsIndex'
CROSS JOIN LATERAL (
    SELECT TRIM(token) AS tag
    FROM regexp_split_to_table(COALESCE(pa.str_value, ''), '\|') AS token
) tokens
WHERE p.deleted_at IS NULL
  AND tokens.tag <> ''
ON CONFLICT (post_id, tag) DO NOTHING;

