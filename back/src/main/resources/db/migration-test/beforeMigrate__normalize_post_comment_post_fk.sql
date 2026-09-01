DO $$
DECLARE
    schema_name text := current_schema();
    post_comment_oid oid;
    post_oid oid;
    post_comment_post_id_attnum smallint;
    post_id_attnum smallint;
    canonical_constraint_oid oid;
    matching_constraint_oid oid;
    matching_constraint_count integer;
    matching_constraint_name text;
BEGIN
    IF schema_name IS NULL THEN
        RAISE EXCEPTION 'Cannot normalize post_comment FK without a current schema';
    END IF;

    post_comment_oid := to_regclass(format('%I.post_comment', schema_name));
    post_oid := to_regclass(format('%I.post', schema_name));

    IF post_comment_oid IS NULL AND post_oid IS NULL THEN
        RETURN;
    END IF;
    IF post_comment_oid IS NULL OR post_oid IS NULL THEN
        RAISE EXCEPTION 'Cannot normalize post_comment FK with only one relation present in schema %', schema_name;
    END IF;

    SELECT attnum
      INTO post_comment_post_id_attnum
      FROM pg_attribute
     WHERE attrelid = post_comment_oid
       AND attname = 'post_id'
       AND attnum > 0
       AND NOT attisdropped;

    SELECT attnum
      INTO post_id_attnum
      FROM pg_attribute
     WHERE attrelid = post_oid
       AND attname = 'id'
       AND attnum > 0
       AND NOT attisdropped;

    IF post_comment_post_id_attnum IS NULL OR post_id_attnum IS NULL THEN
        RAISE EXCEPTION 'Cannot normalize post_comment FK without post_comment.post_id and post.id';
    END IF;

    SELECT oid
      INTO canonical_constraint_oid
      FROM pg_constraint
     WHERE conrelid = post_comment_oid
       AND conname = 'fk_post_comment_post';

    SELECT count(*), min(oid), min(conname::text)
      INTO matching_constraint_count, matching_constraint_oid, matching_constraint_name
      FROM pg_constraint
     WHERE contype = 'f'
       AND conrelid = post_comment_oid
       AND confrelid = post_oid
       AND conkey = ARRAY[post_comment_post_id_attnum]::smallint[]
       AND confkey = ARRAY[post_id_attnum]::smallint[]
       AND convalidated
       AND confupdtype = 'a'
       AND confdeltype = 'a'
       AND confmatchtype = 's'
       AND NOT condeferrable
       AND NOT condeferred;

    IF canonical_constraint_oid IS NOT NULL THEN
        IF matching_constraint_count <> 1 OR matching_constraint_oid <> canonical_constraint_oid THEN
            RAISE EXCEPTION 'Constraint fk_post_comment_post conflicts with the expected relationship';
        END IF;
        RETURN;
    END IF;

    IF matching_constraint_count <> 1 THEN
        RAISE EXCEPTION 'Expected one post_comment.post_id foreign key to post.id, found %', matching_constraint_count;
    END IF;

    EXECUTE format(
        'ALTER TABLE %I.post_comment RENAME CONSTRAINT %I TO fk_post_comment_post',
        schema_name,
        matching_constraint_name
    );
END
$$;
