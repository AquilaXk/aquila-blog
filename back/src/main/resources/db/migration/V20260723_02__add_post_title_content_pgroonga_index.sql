DO $$
BEGIN
    IF to_regclass('public.post') IS NULL
        OR NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgroonga') THEN
        RETURN;
    END IF;

    IF EXISTS(SELECT 1 FROM pg_opclass WHERE opcname = 'pgroonga_text_array_full_text_search_ops_v2') THEN
        CREATE INDEX IF NOT EXISTS idx_post_title_content_pgroonga
            ON post USING pgroonga ((ARRAY["title"::text, "content"::text])
            pgroonga_text_array_full_text_search_ops_v2) WITH (tokenizer = 'TokenBigram');
    ELSIF EXISTS(SELECT 1 FROM pg_opclass WHERE opcname = 'pgroonga_text_array_full_text_search_ops') THEN
        CREATE INDEX IF NOT EXISTS idx_post_title_content_pgroonga
            ON post USING pgroonga ((ARRAY["title"::text, "content"::text])
            pgroonga_text_array_full_text_search_ops) WITH (tokenizer = 'TokenBigram');
    END IF;
END $$;
