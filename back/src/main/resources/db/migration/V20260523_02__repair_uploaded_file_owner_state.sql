DO $$
BEGIN
    IF to_regclass('public.uploaded_file') IS NULL
        OR to_regclass('public.post') IS NULL THEN
        RETURN;
    END IF;

    WITH first_post_match AS (
        SELECT DISTINCT ON (uf.id)
            uf.id AS uploaded_file_id,
            p.id AS post_id
        FROM public.uploaded_file uf
        JOIN public.post p
          ON p.content LIKE ('%' || uf.object_key || '%')
        WHERE uf.status = 'ACTIVE'
          AND uf.owner_type IS NULL
          AND uf.owner_id IS NULL
          AND uf.purpose IN ('POST_IMAGE', 'POST_FILE')
        ORDER BY uf.id, p.id
    )
    UPDATE public.uploaded_file uf
    SET owner_type = 'POST',
        owner_id = first_post_match.post_id,
        retention_reason = NULL,
        purge_after = NULL,
        deleted_at = NULL
    FROM first_post_match
    WHERE uf.id = first_post_match.uploaded_file_id;

    UPDATE public.uploaded_file
    SET status = 'PENDING_DELETE',
        retention_reason = 'DETACHED_POST_ATTACHMENT',
        purge_after = COALESCE(purge_after, now() + interval '14 days')
    WHERE status = 'ACTIVE'
      AND owner_type IS NULL
      AND owner_id IS NULL
      AND purpose IN ('POST_IMAGE', 'POST_FILE');
END $$;
