CREATE INDEX IF NOT EXISTS member_session_idx_member_session_active
    ON member_session (member_id, session_key, revoked_at);
