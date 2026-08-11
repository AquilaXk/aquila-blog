UPDATE task
SET payload =
    jsonb_build_object(
        'schemaVersion', 1,
        'taskType', task_type,
        'sensitivity',
            CASE task_type
                WHEN 'member.createActionLog' THEN 'PERSONAL'
                WHEN 'member.signupVerification.sendMail' THEN 'EXPIRING_SECRET'
                WHEN 'post.interaction.side-effect' THEN 'PERSONAL'
                WHEN 'post.write.side-effect' THEN 'PERSONAL'
                WHEN 'global.revalidate.home' THEN 'PUBLIC'
                WHEN 'global.revalidate.post-cache-purge' THEN 'PUBLIC'
                WHEN 'post.read.prewarm' THEN 'PUBLIC'
                WHEN 'post.search-engine.mirror' THEN 'PUBLIC'
                WHEN 'post.search-index.sync' THEN 'PUBLIC'
                ELSE 'PERSONAL'
            END,
        'createdAtEpochMs', FLOOR(EXTRACT(EPOCH FROM created_at) * 1000)::BIGINT,
        'expiresAtEpochMs', NULL,
        'payloadJson', payload
    )::TEXT;
