DO $$
BEGIN
    IF to_regclass('public.member') IS NOT NULL
        AND EXISTS(
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'public.member'::regclass
              AND conname = 'uk_member_login_id'
        ) THEN
        ALTER TABLE public.member
            DROP CONSTRAINT IF EXISTS uk9q1eki2d9720sgfev4g41igla;
        ALTER TABLE public.member
            DROP CONSTRAINT IF EXISTS ukgc3jmn7c2abyo3wf6syln5t2i;
        DROP INDEX IF EXISTS public.uk9q1eki2d9720sgfev4g41igla;
        DROP INDEX IF EXISTS public.ukgc3jmn7c2abyo3wf6syln5t2i;
    END IF;

    IF to_regclass('public.post_like') IS NOT NULL
        AND to_regclass('public.post_like_uidx_liker_post') IS NOT NULL THEN
        ALTER TABLE public.post_like
            DROP CONSTRAINT IF EXISTS ukfe981nv3v4qefofcqympm581p;
    END IF;
END $$;
