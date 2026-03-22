-- 로그인 유지/아이피 보안 정책을 회원 활성 세션 상태에 저장한다.
-- 현재 구조는 apiKey 단일 활성 세션 모델이므로 회원 단위 정책 저장으로 충분하다.

ALTER TABLE member
    ADD COLUMN IF NOT EXISTS remember_login_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE member
    ADD COLUMN IF NOT EXISTS ip_security_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE member
    ADD COLUMN IF NOT EXISTS ip_security_fingerprint VARCHAR(96);
