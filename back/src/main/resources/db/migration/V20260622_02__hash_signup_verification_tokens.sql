ALTER TABLE public.member_signup_verification
    ADD COLUMN IF NOT EXISTS email_verification_token_hash VARCHAR(128);

ALTER TABLE public.member_signup_verification
    ADD COLUMN IF NOT EXISTS signup_session_token_hash VARCHAR(128);

UPDATE public.member_signup_verification
SET email_verification_token_hash = CONCAT('legacy-email-token-invalidated-', id)
WHERE email_verification_token_hash IS NULL;

UPDATE public.member_signup_verification
SET signup_session_token_hash = NULL
WHERE signup_session_token_hash IS NULL;

ALTER TABLE public.member_signup_verification
    ALTER COLUMN email_verification_token DROP NOT NULL;

ALTER TABLE public.member_signup_verification
    DROP CONSTRAINT IF EXISTS uk_member_signup_verification_email_verification_token;

ALTER TABLE public.member_signup_verification
    DROP CONSTRAINT IF EXISTS uk_member_signup_verification_signup_session_token;

CREATE UNIQUE INDEX IF NOT EXISTS uk_member_signup_verification_email_verification_token_hash
    ON public.member_signup_verification (email_verification_token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS uk_member_signup_verification_signup_session_token_hash
    ON public.member_signup_verification (signup_session_token_hash)
    WHERE signup_session_token_hash IS NOT NULL;
