CREATE OR REPLACE FUNCTION task_wrap_legacy_payload_v1(
    raw_payload TEXT,
    raw_task_type TEXT,
    raw_created_at TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    parsed_payload JSONB;
    schema_version_key CONSTANT TEXT := 'schemaVersion';
    personal_sensitivity CONSTANT TEXT := 'PERSONAL';
    public_sensitivity CONSTANT TEXT := 'PUBLIC';
BEGIN
    parsed_payload := raw_payload::JSONB;
    IF jsonb_typeof(parsed_payload) <> 'object' THEN
        RAISE EXCEPTION 'legacy task payload must be a JSON object';
    END IF;
    IF jsonb_exists(parsed_payload, schema_version_key) THEN
        RETURN raw_payload;
    END IF;
    IF jsonb_exists_any(
        parsed_payload,
        ARRAY['taskType', 'sensitivity', 'createdAtEpochMs', 'expiresAtEpochMs', 'payloadJson']::TEXT[]
    ) THEN
        RAISE EXCEPTION 'legacy task payload contains a reserved envelope field';
    END IF;

    RETURN (
        parsed_payload ||
        jsonb_build_object(
            schema_version_key, 1,
            'taskType', raw_task_type,
            'sensitivity',
                CASE raw_task_type
                    WHEN 'member.createActionLog' THEN personal_sensitivity
                    WHEN 'member.signupVerification.sendMail' THEN 'EXPIRING_SECRET'
                    WHEN 'post.interaction.side-effect' THEN personal_sensitivity
                    WHEN 'post.write.side-effect' THEN personal_sensitivity
                    WHEN 'global.revalidate.home' THEN public_sensitivity
                    WHEN 'global.revalidate.post-cache-purge' THEN public_sensitivity
                    WHEN 'post.read.prewarm' THEN public_sensitivity
                    WHEN 'post.search-engine.mirror' THEN public_sensitivity
                    WHEN 'post.search-index.sync' THEN public_sensitivity
                    ELSE personal_sensitivity
                END,
            'createdAtEpochMs', FLOOR(EXTRACT(EPOCH FROM raw_created_at) * 1000)::BIGINT,
            'expiresAtEpochMs', NULL
        )
    )::TEXT;
END;
$$;

UPDATE task
SET payload = task_wrap_legacy_payload_v1(payload, task_type, created_at)
WHERE payload IS NOT NULL;

CREATE OR REPLACE FUNCTION task_normalize_legacy_payload_v1_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.payload := task_wrap_legacy_payload_v1(
        NEW.payload,
        NEW.task_type,
        COALESCE(NEW.created_at, CURRENT_TIMESTAMP)
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER task_normalize_legacy_payload_v1_before_insert
BEFORE INSERT ON task
FOR EACH ROW
EXECUTE FUNCTION task_normalize_legacy_payload_v1_on_insert();
