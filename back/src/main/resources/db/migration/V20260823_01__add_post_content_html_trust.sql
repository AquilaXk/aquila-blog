ALTER TABLE post
    ADD COLUMN content_html_hash VARCHAR(64),
    ADD COLUMN content_html_sanitizer_policy_version VARCHAR(64),
    ADD COLUMN content_html_trust_state VARCHAR(32);

ALTER TABLE post
    ADD CONSTRAINT post_content_html_trust_state_check
    CHECK (content_html_trust_state IN ('TRUSTED_CURRENT', 'UNKNOWN', 'REJECTED')) NOT VALID;

COMMENT ON COLUMN post.content_html_hash IS 'stored sanitized content_html UTF-8 SHA-256';
COMMENT ON COLUMN post.content_html_sanitizer_policy_version IS 'content_html sanitizer policy version';
COMMENT ON COLUMN post.content_html_trust_state IS 'TRUSTED_CURRENT, UNKNOWN, REJECTED';
