LOCK TABLE
    member_signup_verification,
    pending_oauth_signup,
    member_privacy_request,
    member_notification,
    post_comment,
    post,
    post_attr,
    member_attr
IN SHARE MODE;

DO $$
DECLARE
    retired_drift_count bigint;
BEGIN
    SELECT
        (SELECT count(*) FROM member_signup_verification)
        + (SELECT count(*) FROM pending_oauth_signup)
        + (SELECT count(*) FROM member_privacy_request)
        + (SELECT count(*) FROM member_notification)
        + (SELECT count(*) FROM post_comment)
        + (SELECT count(*) FROM post WHERE comments_count_attr_id IS NOT NULL)
        + (SELECT count(*) FROM post_attr WHERE name = 'commentsCount')
        + (SELECT count(*) FROM member_attr WHERE name = 'postCommentsCount')
    INTO retired_drift_count;

    IF retired_drift_count <> 0 THEN
        RAISE EXCEPTION 'retired persistence schema removal blocked by data drift';
    END IF;
END
$$;

ALTER TABLE post
    DROP COLUMN comments_count_attr_id;

DROP TABLE member_notification;
DROP TABLE post_comment;
DROP TABLE member_signup_verification;
DROP TABLE pending_oauth_signup;
DROP TABLE member_privacy_request;

DROP SEQUENCE member_notification_seq;
DROP SEQUENCE post_comment_seq;
DROP SEQUENCE member_signup_verification_seq;
DROP SEQUENCE pending_oauth_signup_seq;
DROP SEQUENCE member_privacy_request_seq;
