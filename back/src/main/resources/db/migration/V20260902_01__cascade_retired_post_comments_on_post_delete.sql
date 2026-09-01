ALTER TABLE post_comment
    DROP CONSTRAINT fk_post_comment_post;

ALTER TABLE post_comment
    ADD CONSTRAINT fk_post_comment_post
        FOREIGN KEY (post_id) REFERENCES post (id)
        ON DELETE CASCADE;
