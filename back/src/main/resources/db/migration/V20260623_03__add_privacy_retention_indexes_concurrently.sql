CREATE INDEX CONCURRENTLY IF NOT EXISTS member_signup_verification_idx_consumed_at_id
    ON member_signup_verification (consumed_at ASC, id ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_signup_verification_idx_cancelled_at_id
    ON member_signup_verification (cancelled_at ASC, id ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_signup_verification_idx_email_verification_expires_at_id
    ON member_signup_verification (email_verification_expires_at ASC, id ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_signup_verification_idx_signup_session_expires_at_id
    ON member_signup_verification (signup_session_expires_at ASC, id ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_notification_idx_created_at_id
    ON member_notification (created_at ASC, id ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_privacy_request_idx_status_closed_at_id
    ON member_privacy_request (status, (COALESCE(completed_at, modified_at, requested_at)), id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS member_action_log_idx_created_at_id
    ON member_action_log (created_at ASC, id ASC);
