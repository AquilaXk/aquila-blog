ALTER TABLE member_session
    ADD COLUMN IF NOT EXISTS refresh_token_hash VARCHAR(128),
    ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS refresh_token_rotated_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS refresh_token_reused_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS member_session_idx_refresh_token_expires_at
    ON member_session (refresh_token_expires_at);
