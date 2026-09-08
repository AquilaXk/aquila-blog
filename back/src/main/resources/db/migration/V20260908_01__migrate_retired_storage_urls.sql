-- 퇴역 호스트만 제거하고 경로·인코딩·query·fragment 및 원문 나머지는 보존한다.
WITH rewritten AS (
    SELECT id,
           replace(replace(content,
               'https://api.aquilaxk.site/post/api/v1/images/', '/post/api/v1/images/'),
               'https://api.aquilaxk.site/post/api/v1/files/', '/post/api/v1/files/') AS content,
           replace(replace(content_html,
               'https://api.aquilaxk.site/post/api/v1/images/', '/post/api/v1/images/'),
               'https://api.aquilaxk.site/post/api/v1/files/', '/post/api/v1/files/') AS content_html
    FROM post
)
UPDATE post p
SET content = r.content,
    content_html = r.content_html,
    -- 기존 hash가 실제 원문을 증명한 경우만 갱신한다. 신뢰 상태를 승격하지 않는다.
    content_html_hash = CASE
        WHEN p.content_html IS DISTINCT FROM r.content_html
         AND p.content_html_hash = encode(sha256(convert_to(p.content_html, 'UTF8')), 'hex')
        THEN encode(sha256(convert_to(r.content_html, 'UTF8')), 'hex')
        ELSE p.content_html_hash
    END,
    version = coalesce(p.version, 0) + 1,
    modified_at = CURRENT_TIMESTAMP
FROM rewritten r
WHERE p.id = r.id
  AND (p.content IS DISTINCT FROM r.content OR p.content_html IS DISTINCT FROM r.content_html);

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
