-- 이메일 식별자 로그인 전환을 위한 읽기 경로 보강
-- 1) lower(email) 조회 인덱스를 추가해 인증 조회 성능을 안정화한다.
-- 2) 대소문자만 다른 중복 이메일이 없는 행에 한해 소문자 정규화를 수행한다.

WITH duplicated_normalized_emails AS (
    SELECT lower(trim(email)) AS normalized_email
    FROM member
    WHERE email IS NOT NULL
    GROUP BY lower(trim(email))
    HAVING COUNT(*) > 1
)
UPDATE member
SET email = lower(trim(email))
WHERE email IS NOT NULL
  AND email <> lower(trim(email))
  AND lower(trim(email)) NOT IN (
      SELECT normalized_email
      FROM duplicated_normalized_emails
  );

CREATE INDEX IF NOT EXISTS member_idx_lower_email
    ON member ((lower(email)))
    WHERE email IS NOT NULL;
