-- 참조 구현: TryGhost/Ghost (MIT) & payloadcms/payload (MIT) — 예약 발행·연재 시리즈·교차 게시 정본 URL 컬럼 확장 (Expand)
ALTER TABLE post
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS series_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS series_order INT,
    ADD COLUMN IF NOT EXISTS canonical_url VARCHAR(2048);
