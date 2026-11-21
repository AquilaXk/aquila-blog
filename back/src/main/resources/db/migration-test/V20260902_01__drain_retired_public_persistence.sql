DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM member_privacy_request
        WHERE status IN ('RECEIVED', 'IN_PROGRESS')
    ) THEN
        RAISE EXCEPTION 'retired persistence drain blocked by unresolved privacy requests';
    END IF;
END
$$;

UPDATE post
SET comments_count_attr_id = NULL
WHERE comments_count_attr_id IS NOT NULL;

DELETE FROM member_notification WHERE id IS NOT NULL;
DELETE FROM post_comment WHERE id IS NOT NULL;
DELETE FROM post_attr WHERE name = 'commentsCount';
DELETE FROM member_attr WHERE name = 'postCommentsCount';
DELETE FROM member_signup_verification WHERE id IS NOT NULL;
DELETE FROM pending_oauth_signup WHERE id IS NOT NULL;
DELETE FROM member_privacy_request WHERE id IS NOT NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM member_signup_verification)
        OR EXISTS (SELECT 1 FROM pending_oauth_signup)
        OR EXISTS (SELECT 1 FROM member_privacy_request)
        OR EXISTS (SELECT 1 FROM member_notification)
        OR EXISTS (SELECT 1 FROM post_comment)
        OR EXISTS (SELECT 1 FROM post WHERE comments_count_attr_id IS NOT NULL)
        OR EXISTS (SELECT 1 FROM post_attr WHERE name = 'commentsCount')
        OR EXISTS (SELECT 1 FROM member_attr WHERE name = 'postCommentsCount')
    THEN
        RAISE EXCEPTION 'retired persistence drain did not reach zero';
    END IF;
END
$$;

ALTER TABLE post_comment
    DROP CONSTRAINT fk_post_comment_post;

ALTER TABLE post_comment
    ADD CONSTRAINT fk_post_comment_post
        FOREIGN KEY (post_id) REFERENCES post (id)
        ON DELETE CASCADE;
