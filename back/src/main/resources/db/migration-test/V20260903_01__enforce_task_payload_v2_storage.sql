DROP TRIGGER task_normalize_legacy_payload_v1_before_insert ON task;
DROP FUNCTION task_normalize_legacy_payload_v1_on_insert();
DROP FUNCTION task_wrap_legacy_payload_v1(TEXT, TEXT, TIMESTAMPTZ);

ALTER TABLE task
    ADD CONSTRAINT task_payload_v2_or_exact_redacted
    CHECK (
        payload = '{"redacted":true}'
        OR (
            jsonb_typeof(payload::JSONB) = 'object'
            AND payload::JSONB ?& ARRAY[
                'schemaVersion',
                'taskType',
                'sensitivity',
                'createdAtEpochMs',
                'expiresAtEpochMs',
                'payloadJson'
            ]
            AND (payload::JSONB - ARRAY[
                'schemaVersion',
                'taskType',
                'sensitivity',
                'createdAtEpochMs',
                'expiresAtEpochMs',
                'payloadJson'
            ]) = '{}'::JSONB
            AND jsonb_typeof(payload::JSONB -> 'schemaVersion') = 'number'
            AND payload::JSONB ->> 'schemaVersion' = '2'
            AND jsonb_typeof(payload::JSONB -> 'taskType') = 'string'
            AND payload::JSONB ->> 'taskType' = task_type
            AND jsonb_typeof(payload::JSONB -> 'sensitivity') = 'string'
            AND payload::JSONB ->> 'sensitivity' IN ('PUBLIC', 'INTERNAL', 'PERSONAL', 'EXPIRING_SECRET')
            AND jsonb_typeof(payload::JSONB -> 'createdAtEpochMs') = 'number'
            AND payload::JSONB ->> 'createdAtEpochMs' ~ '^[1-9][0-9]*$'
            AND pg_input_is_valid(payload::JSONB ->> 'createdAtEpochMs', 'bigint')
            AND (
                payload::JSONB -> 'expiresAtEpochMs' = 'null'::JSONB
                OR (
                    jsonb_typeof(payload::JSONB -> 'expiresAtEpochMs') = 'number'
                    AND payload::JSONB ->> 'expiresAtEpochMs' ~ '^[1-9][0-9]*$'
                    AND pg_input_is_valid(payload::JSONB ->> 'expiresAtEpochMs', 'bigint')
                )
            )
            AND jsonb_typeof(payload::JSONB -> 'payloadJson') = 'string'
            AND CASE
                WHEN NOT pg_input_is_valid(payload::JSONB ->> 'payloadJson', 'jsonb') THEN FALSE
                ELSE
                    jsonb_typeof((payload::JSONB ->> 'payloadJson')::JSONB) = 'object'
                    AND (payload::JSONB ->> 'payloadJson')::JSONB ?& ARRAY[
                        'uid',
                        'aggregateType',
                        'aggregateId'
                    ]
                    AND (payload::JSONB ->> 'payloadJson')::JSONB ->> 'uid' = uid::TEXT
                    AND (payload::JSONB ->> 'payloadJson')::JSONB ->> 'aggregateType' = aggregate_type
                    AND (payload::JSONB ->> 'payloadJson')::JSONB ->> 'aggregateId' = aggregate_id::TEXT
            END
        )
    );
