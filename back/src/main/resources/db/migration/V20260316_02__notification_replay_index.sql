DO $$
BEGIN
    IF to_regclass('public.member_notification') IS NOT NULL THEN
        -- SSE 재연결 시 receiver_id + id 기반 replay 조회를 빠르게 처리한다.
        CREATE INDEX IF NOT EXISTS member_notification_idx_receiver_id_asc
            ON member_notification (receiver_id, id ASC);
    END IF;
END $$;
