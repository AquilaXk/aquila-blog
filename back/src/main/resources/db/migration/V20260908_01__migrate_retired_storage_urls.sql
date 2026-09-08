-- 퇴역 호스트만 제거하고 경로·인코딩·query·fragment 및 원문 나머지는 보존한다.
-- 잠금 대기 후 최신 대상 행에서 변환해 활성 서버가 저장한 원고를 보존한다.
UPDATE post p
SET content = replace(replace(p.content,
        'https://api.aquilaxk.site/post/api/v1/images/', '/post/api/v1/images/'),
        'https://api.aquilaxk.site/post/api/v1/files/', '/post/api/v1/files/'),
    content_html = replace(replace(p.content_html,
        'https://api.aquilaxk.site/post/api/v1/images/', '/post/api/v1/images/'),
        'https://api.aquilaxk.site/post/api/v1/files/', '/post/api/v1/files/'),
    -- 기존 hash가 실제 원문을 증명한 경우만 갱신한다. 신뢰 상태를 승격하지 않는다.
    content_html_hash = CASE
        WHEN (strpos(p.content_html, 'https://api.aquilaxk.site/post/api/v1/images/') > 0
           OR strpos(p.content_html, 'https://api.aquilaxk.site/post/api/v1/files/') > 0)
         AND p.content_html_hash = encode(sha256(convert_to(p.content_html, 'UTF8')), 'hex')
        THEN encode(sha256(convert_to(replace(replace(p.content_html,
            'https://api.aquilaxk.site/post/api/v1/images/', '/post/api/v1/images/'),
            'https://api.aquilaxk.site/post/api/v1/files/', '/post/api/v1/files/'), 'UTF8')), 'hex')
        ELSE p.content_html_hash
    END,
    version = coalesce(p.version, 0) + 1,
    modified_at = CURRENT_TIMESTAMP
WHERE strpos(p.content, 'https://api.aquilaxk.site/post/api/v1/images/') > 0
   OR strpos(p.content, 'https://api.aquilaxk.site/post/api/v1/files/') > 0
   OR strpos(p.content_html, 'https://api.aquilaxk.site/post/api/v1/images/') > 0
   OR strpos(p.content_html, 'https://api.aquilaxk.site/post/api/v1/files/') > 0;

-- canonical decoder는 직렬화 bytes도 검사하므로 jsonb로 재직렬화하지 않는다.
-- 이 필드는 canonical envelope에 한 번만 존재하며 문자열 내부의 escaped 키와는 다르다.
UPDATE member_attr
SET str_value = replace(replace(str_value,
        '"profileImageUrl":"https://api.aquilaxk.site/post/api/v1/images/',
        '"profileImageUrl":"/post/api/v1/images/'),
        '"profileImageUrl":"https://api.aquilaxk.site/post/api/v1/files/',
        '"profileImageUrl":"/post/api/v1/files/'),
    modified_at = CURRENT_TIMESTAMP
WHERE name IN ('profileWorkspaceDraft', 'profileWorkspacePublished')
  AND (strpos(str_value, '"profileImageUrl":"https://api.aquilaxk.site/post/api/v1/images/') > 0
    OR strpos(str_value, '"profileImageUrl":"https://api.aquilaxk.site/post/api/v1/files/') > 0);
