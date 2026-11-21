-- 디바이스 단위 로그인 정책 분리를 위한 member_session 테이블
-- 기존 member.api_key는 계정 식별 용도로 유지하고, remember/ip-security 정책은 세션 레코드에서 관리한다.

CREATE SEQUENCE IF NOT EXISTS member_session_seq
    START WITH 1
    INCREMENT BY 50
    CACHE 1;

CREATE TABLE IF NOT EXISTS member_session
(
    id                       BIGINT PRIMARY KEY DEFAULT nextval('member_session_seq'),
    member_id                BIGINT                   NOT NULL REFERENCES member (id) ON DELETE CASCADE,
    session_key              VARCHAR(96)              NOT NULL UNIQUE,
    remember_login_enabled   BOOLEAN                  NOT NULL DEFAULT TRUE,
    ip_security_enabled      BOOLEAN                  NOT NULL DEFAULT FALSE,
    ip_security_fingerprint  VARCHAR(96),
    created_ip               VARCHAR(128),
    user_agent               VARCHAR(512),
    last_authenticated_at    TIMESTAMP WITH TIME ZONE,
    revoked_at               TIMESTAMP WITH TIME ZONE,
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_session_idx_member_active
    ON member_session (member_id, revoked_at);

CREATE INDEX IF NOT EXISTS member_session_idx_last_authenticated_desc
    ON member_session (last_authenticated_at DESC);
