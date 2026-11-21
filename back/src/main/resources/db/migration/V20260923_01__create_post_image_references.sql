CREATE SEQUENCE IF NOT EXISTS post_image_references_seq INCREMENT BY 50 START WITH 1;

CREATE TABLE IF NOT EXISTS post_image_references (
    id BIGINT NOT NULL PRIMARY KEY DEFAULT nextval('post_image_references_seq'),
    post_id BIGINT NOT NULL,
    object_key VARCHAR(1000) NOT NULL,
    uploaded_file_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_post_image_references_post_key UNIQUE (post_id, object_key)
);

CREATE INDEX IF NOT EXISTS idx_post_image_references_post_id ON post_image_references (post_id);
CREATE INDEX IF NOT EXISTS idx_post_image_references_object_key ON post_image_references (object_key);

DO $$
BEGIN
    IF to_regclass('public.post_image_references') IS NOT NULL
        AND to_regclass('public.uploaded_file') IS NOT NULL
        AND to_regclass('public.post') IS NOT NULL THEN

        INSERT INTO public.post_image_references (post_id, object_key, uploaded_file_id, created_at, modified_at)
        SELECT DISTINCT
            p.id AS post_id,
            uf.object_key AS object_key,
            uf.id AS uploaded_file_id,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM public.uploaded_file uf
        JOIN public.post p
          ON (uf.owner_type = 'POST' AND uf.owner_id = p.id)
             OR p.content LIKE ('%' || uf.object_key || '%')
        WHERE uf.purpose IN ('POST_IMAGE', 'POST_FILE')
          AND uf.status != 'DELETED'
        ON CONFLICT (post_id, object_key) DO NOTHING;
    END IF;
END $$;
