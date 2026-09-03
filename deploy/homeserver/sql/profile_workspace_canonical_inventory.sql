BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

WITH constants AS (
    SELECT chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) AS kotlin_trim_chars
),
profile_attrs AS (
    SELECT
        m.id,
        m.deleted_at IS NULL AS active,
        MAX(ma.str_value) FILTER (WHERE ma.name = 'profileWorkspaceDraft') AS draft_raw,
        MAX(ma.str_value) FILTER (WHERE ma.name = 'profileWorkspacePublished') AS published_raw,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'profileImgUrl'), '') AS legacy_profile_image_url,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'profileRole'), '') AS legacy_profile_role,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'profileBio'), '') AS legacy_profile_bio,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'aboutRole'), '') AS legacy_about_role,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'aboutBio'), '') AS legacy_about_bio,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'aboutDetails'), '') AS legacy_about_details,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'blogTitle'), '') AS legacy_blog_title,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'homeIntroTitle'), '') AS legacy_home_intro_title,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'homeIntroDescription'), '') AS legacy_home_intro_description,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'blogDesign'), '') AS legacy_blog_design,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'legacyBlogScheme'), '') AS legacy_blog_scheme,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'profileServiceLinks'), '') AS legacy_service_links_raw,
        COALESCE(MAX(ma.str_value) FILTER (WHERE ma.name = 'profileContactLinks'), '') AS legacy_contact_links_raw
    FROM member AS m
    LEFT JOIN member_attr AS ma
        ON ma.subject_id = m.id
       AND ma.name IN (
           'profileWorkspaceDraft', 'profileWorkspacePublished', 'profileImgUrl', 'profileRole',
           'profileBio', 'aboutRole', 'aboutBio', 'aboutDetails', 'blogTitle', 'homeIntroTitle',
           'homeIntroDescription', 'blogDesign', 'legacyBlogScheme', 'profileServiceLinks',
           'profileContactLinks'
       )
    GROUP BY m.id, m.deleted_at
),
parsed AS (
    SELECT
        profile_attrs.*,
        constants.kotlin_trim_chars,
        CASE WHEN pg_input_is_valid(draft_raw, 'jsonb') THEN draft_raw::jsonb END AS draft_doc,
        CASE WHEN pg_input_is_valid(published_raw, 'jsonb') THEN published_raw::jsonb END AS published_doc,
        CASE
            WHEN btrim(legacy_service_links_raw, constants.kotlin_trim_chars) = '' THEN '[]'::jsonb
            WHEN pg_input_is_valid(legacy_service_links_raw, 'jsonb')
             AND jsonb_typeof(legacy_service_links_raw::jsonb) = 'object'
             AND jsonb_typeof(legacy_service_links_raw::jsonb -> 'items') = 'array'
                THEN legacy_service_links_raw::jsonb -> 'items'
            ELSE '[]'::jsonb
        END AS legacy_service_links,
        CASE
            WHEN btrim(legacy_contact_links_raw, constants.kotlin_trim_chars) = '' THEN '[]'::jsonb
            WHEN pg_input_is_valid(legacy_contact_links_raw, 'jsonb')
             AND jsonb_typeof(legacy_contact_links_raw::jsonb) = 'object'
             AND jsonb_typeof(legacy_contact_links_raw::jsonb -> 'items') = 'array'
                THEN legacy_contact_links_raw::jsonb -> 'items'
            ELSE '[]'::jsonb
        END AS legacy_contact_links
    FROM profile_attrs
    CROSS JOIN constants
),
classified AS (
    SELECT
        parsed.*,
        CASE
            WHEN draft_raw IS NULL THEN 'missing'
            WHEN btrim(draft_raw, kotlin_trim_chars) = '' THEN 'blank'
            WHEN draft_doc IS NULL THEN 'invalid_json'
            WHEN jsonb_typeof(draft_doc) <> 'object'
              OR (SELECT COUNT(*) FROM jsonb_object_keys(draft_doc)) <> 1
              OR NOT draft_doc ? 'content'
              OR jsonb_typeof(draft_doc -> 'content') <> 'object' THEN 'invalid_shape'
            WHEN NOT (draft_doc -> 'content') ?& ARRAY[
                'profileImageUrl', 'profileRole', 'profileBio', 'aboutHeadline', 'aboutRole', 'aboutBio',
                'aboutSections', 'aboutProjectSectionTitle', 'aboutProjects', 'blogTitle', 'homeIntroTitle',
                'homeIntroDescription', 'blogDesign', 'legacyBlogScheme', 'serviceLinks', 'contactLinks'
            ]
              OR (SELECT COUNT(*) FROM jsonb_object_keys(draft_doc -> 'content')) <> 16
              OR jsonb_typeof(draft_doc -> 'content' -> 'aboutSections') <> 'array'
              OR jsonb_typeof(draft_doc -> 'content' -> 'aboutProjects') <> 'array'
              OR jsonb_typeof(draft_doc -> 'content' -> 'serviceLinks') <> 'array'
              OR jsonb_typeof(draft_doc -> 'content' -> 'contactLinks') <> 'array'
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(draft_doc -> 'content' -> 'aboutSections') = 'array'
                          THEN draft_doc -> 'content' -> 'aboutSections' ELSE '[]'::jsonb END
                  ) AS item(value)
                  WHERE jsonb_typeof(item.value) <> 'object'
                     OR (SELECT COUNT(*) FROM jsonb_object_keys(
                         CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
                     )) <> 4
                     OR NOT item.value ?& ARRAY['id', 'title', 'items', 'dividerBefore']
                     OR jsonb_typeof(item.value -> 'id') <> 'string'
                     OR jsonb_typeof(item.value -> 'title') <> 'string'
                     OR jsonb_typeof(item.value -> 'items') <> 'array'
                     OR jsonb_typeof(item.value -> 'dividerBefore') <> 'boolean'
                     OR EXISTS (
                         SELECT 1 FROM jsonb_array_elements(
                             CASE WHEN jsonb_typeof(item.value -> 'items') = 'array'
                                 THEN item.value -> 'items' ELSE '[]'::jsonb END
                         ) AS section_item(value)
                         WHERE jsonb_typeof(section_item.value) <> 'string'
                     )
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(draft_doc -> 'content' -> 'aboutProjects') = 'array'
                          THEN draft_doc -> 'content' -> 'aboutProjects' ELSE '[]'::jsonb END
                  ) AS item(value)
                  WHERE jsonb_typeof(item.value) <> 'object'
                     OR (SELECT COUNT(*) FROM jsonb_object_keys(
                         CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
                     )) <> 6
                     OR NOT item.value ?& ARRAY['id', 'name', 'summary', 'role', 'href', 'linkLabel']
                     OR EXISTS (SELECT 1 FROM unnest(ARRAY['id', 'name', 'summary', 'role', 'href', 'linkLabel']) AS key(name) WHERE jsonb_typeof(item.value -> key.name) <> 'string')
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(draft_doc -> 'content' -> 'serviceLinks') = 'array'
                          THEN draft_doc -> 'content' -> 'serviceLinks' ELSE '[]'::jsonb END
                  ) AS item(value)
                  WHERE jsonb_typeof(item.value) <> 'object'
                     OR (SELECT COUNT(*) FROM jsonb_object_keys(
                         CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
                     )) <> 3
                     OR NOT item.value ?& ARRAY['icon', 'label', 'href']
                     OR EXISTS (SELECT 1 FROM unnest(ARRAY['icon', 'label', 'href']) AS key(name) WHERE jsonb_typeof(item.value -> key.name) <> 'string')
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(draft_doc -> 'content' -> 'contactLinks') = 'array'
                          THEN draft_doc -> 'content' -> 'contactLinks' ELSE '[]'::jsonb END
                  ) AS item(value)
                  WHERE jsonb_typeof(item.value) <> 'object'
                     OR (SELECT COUNT(*) FROM jsonb_object_keys(
                         CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
                     )) <> 3
                     OR NOT item.value ?& ARRAY['icon', 'label', 'href']
                     OR EXISTS (SELECT 1 FROM unnest(ARRAY['icon', 'label', 'href']) AS key(name) WHERE jsonb_typeof(item.value -> key.name) <> 'string')
              )
              OR EXISTS (
                  SELECT 1
                  FROM unnest(ARRAY[
                      'profileImageUrl', 'profileRole', 'profileBio', 'aboutHeadline', 'aboutRole', 'aboutBio',
                      'aboutProjectSectionTitle', 'blogTitle', 'homeIntroTitle', 'homeIntroDescription',
                      'blogDesign', 'legacyBlogScheme'
                  ]) AS key(name)
                  WHERE jsonb_typeof(draft_doc -> 'content' -> key.name) <> 'string'
              ) THEN 'invalid_shape'
            WHEN EXISTS (
                  SELECT 1
                  FROM unnest(ARRAY[
                      'profileImageUrl', 'profileRole', 'profileBio', 'aboutHeadline', 'aboutRole', 'aboutBio',
                      'aboutProjectSectionTitle', 'blogTitle', 'homeIntroTitle', 'homeIntroDescription'
                  ]) AS key(name)
                  WHERE draft_doc -> 'content' ->> key.name <> btrim(draft_doc -> 'content' ->> key.name, kotlin_trim_chars)
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(draft_doc -> 'content' -> 'aboutSections') AS item(value)
                  WHERE item.value ->> 'id' = ''
                     OR item.value ->> 'id' <> btrim(item.value ->> 'id', kotlin_trim_chars)
                     OR item.value ->> 'title' <> btrim(item.value ->> 'title', kotlin_trim_chars)
                     OR (item.value ->> 'title' = '' AND jsonb_array_length(item.value -> 'items') = 0)
                     OR EXISTS (
                         SELECT 1 FROM jsonb_array_elements(item.value -> 'items') AS section_item(value)
                         WHERE section_item.value #>> '{}' = ''
                            OR section_item.value #>> '{}' <> btrim(section_item.value #>> '{}', kotlin_trim_chars)
                     )
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(draft_doc -> 'content' -> 'aboutProjects') AS item(value)
                  WHERE item.value ->> 'id' = ''
                     OR EXISTS (
                         SELECT 1 FROM unnest(ARRAY['id', 'name', 'summary', 'role', 'href', 'linkLabel']) AS key(name)
                         WHERE item.value ->> key.name <> btrim(item.value ->> key.name, kotlin_trim_chars)
                     )
                     OR (
                         item.value ->> 'name' = '' AND item.value ->> 'summary' = ''
                         AND item.value ->> 'role' = '' AND item.value ->> 'href' = ''
                     )
                     OR (item.value ->> 'href' <> '' AND item.value ->> 'linkLabel' = '')
              )
              OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(draft_doc -> 'content' -> 'serviceLinks') AS item(value)
                  CROSS JOIN unnest(ARRAY['icon', 'label', 'href']) AS key(name)
                  WHERE item.value ->> key.name <> btrim(item.value ->> key.name, kotlin_trim_chars)
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(draft_doc -> 'content' -> 'serviceLinks') AS item(value)
                  WHERE item.value ->> 'icon' NOT IN (
                      'service', 'briefcase', 'laptop', 'rocket', 'spark', 'search', 'tag', 'camera', 'question'
                  )
                     OR item.value ->> 'label' = ''
                     OR item.value ->> 'href' = ''
              )
              OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(draft_doc -> 'content' -> 'contactLinks') AS item(value)
                  CROSS JOIN unnest(ARRAY['icon', 'label', 'href']) AS key(name)
                  WHERE item.value ->> key.name <> btrim(item.value ->> key.name, kotlin_trim_chars)
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(draft_doc -> 'content' -> 'contactLinks') AS item(value)
                  WHERE item.value ->> 'icon' NOT IN (
                      'github', 'linkedin', 'mail', 'message', 'kakao', 'instagram', 'globe', 'link', 'phone', 'bell'
                  )
                     OR item.value ->> 'label' = ''
                     OR item.value ->> 'href' = ''
              )
              OR (draft_doc -> 'content' ->> 'blogDesign') <> CASE
                  WHEN lower(btrim(draft_doc -> 'content' ->> 'blogDesign', kotlin_trim_chars)) = 'grid' THEN 'grid'
                  ELSE 'legacy'
              END
              OR (draft_doc -> 'content' ->> 'legacyBlogScheme') <> CASE
                  WHEN lower(btrim(draft_doc -> 'content' ->> 'legacyBlogScheme', kotlin_trim_chars)) = 'light' THEN 'light'
                  ELSE 'dark'
              END THEN 'noncanonical'
            ELSE 'canonical'
        END AS draft_state,
        CASE
            WHEN published_raw IS NULL THEN 'missing'
            WHEN btrim(published_raw, kotlin_trim_chars) = '' THEN 'blank'
            WHEN published_doc IS NULL THEN 'invalid_json'
            WHEN jsonb_typeof(published_doc) <> 'object'
              OR (SELECT COUNT(*) FROM jsonb_object_keys(published_doc)) <> 1
              OR NOT published_doc ? 'content'
              OR jsonb_typeof(published_doc -> 'content') <> 'object' THEN 'invalid_shape'
            WHEN NOT (published_doc -> 'content') ?& ARRAY[
                'profileImageUrl', 'profileRole', 'profileBio', 'aboutHeadline', 'aboutRole', 'aboutBio',
                'aboutSections', 'aboutProjectSectionTitle', 'aboutProjects', 'blogTitle', 'homeIntroTitle',
                'homeIntroDescription', 'blogDesign', 'legacyBlogScheme', 'serviceLinks', 'contactLinks'
            ]
              OR (SELECT COUNT(*) FROM jsonb_object_keys(published_doc -> 'content')) <> 16
              OR jsonb_typeof(published_doc -> 'content' -> 'aboutSections') <> 'array'
              OR jsonb_typeof(published_doc -> 'content' -> 'aboutProjects') <> 'array'
              OR jsonb_typeof(published_doc -> 'content' -> 'serviceLinks') <> 'array'
              OR jsonb_typeof(published_doc -> 'content' -> 'contactLinks') <> 'array'
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(published_doc -> 'content' -> 'aboutSections') = 'array'
                          THEN published_doc -> 'content' -> 'aboutSections' ELSE '[]'::jsonb END
                  ) AS item(value)
                  WHERE jsonb_typeof(item.value) <> 'object'
                     OR (SELECT COUNT(*) FROM jsonb_object_keys(
                         CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
                     )) <> 4
                     OR NOT item.value ?& ARRAY['id', 'title', 'items', 'dividerBefore']
                     OR jsonb_typeof(item.value -> 'id') <> 'string'
                     OR jsonb_typeof(item.value -> 'title') <> 'string'
                     OR jsonb_typeof(item.value -> 'items') <> 'array'
                     OR jsonb_typeof(item.value -> 'dividerBefore') <> 'boolean'
                     OR EXISTS (
                         SELECT 1 FROM jsonb_array_elements(
                             CASE WHEN jsonb_typeof(item.value -> 'items') = 'array'
                                 THEN item.value -> 'items' ELSE '[]'::jsonb END
                         ) AS section_item(value)
                         WHERE jsonb_typeof(section_item.value) <> 'string'
                     )
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(published_doc -> 'content' -> 'aboutProjects') = 'array'
                          THEN published_doc -> 'content' -> 'aboutProjects' ELSE '[]'::jsonb END
                  ) AS item(value)
                  WHERE jsonb_typeof(item.value) <> 'object'
                     OR (SELECT COUNT(*) FROM jsonb_object_keys(
                         CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
                     )) <> 6
                     OR NOT item.value ?& ARRAY['id', 'name', 'summary', 'role', 'href', 'linkLabel']
                     OR EXISTS (SELECT 1 FROM unnest(ARRAY['id', 'name', 'summary', 'role', 'href', 'linkLabel']) AS key(name) WHERE jsonb_typeof(item.value -> key.name) <> 'string')
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(published_doc -> 'content' -> 'serviceLinks') = 'array'
                          THEN published_doc -> 'content' -> 'serviceLinks' ELSE '[]'::jsonb END
                  ) AS item(value)
                  WHERE jsonb_typeof(item.value) <> 'object'
                     OR (SELECT COUNT(*) FROM jsonb_object_keys(
                         CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
                     )) <> 3
                     OR NOT item.value ?& ARRAY['icon', 'label', 'href']
                     OR EXISTS (SELECT 1 FROM unnest(ARRAY['icon', 'label', 'href']) AS key(name) WHERE jsonb_typeof(item.value -> key.name) <> 'string')
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(published_doc -> 'content' -> 'contactLinks') = 'array'
                          THEN published_doc -> 'content' -> 'contactLinks' ELSE '[]'::jsonb END
                  ) AS item(value)
                  WHERE jsonb_typeof(item.value) <> 'object'
                     OR (SELECT COUNT(*) FROM jsonb_object_keys(
                         CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
                     )) <> 3
                     OR NOT item.value ?& ARRAY['icon', 'label', 'href']
                     OR EXISTS (SELECT 1 FROM unnest(ARRAY['icon', 'label', 'href']) AS key(name) WHERE jsonb_typeof(item.value -> key.name) <> 'string')
              )
              OR EXISTS (
                  SELECT 1
                  FROM unnest(ARRAY[
                      'profileImageUrl', 'profileRole', 'profileBio', 'aboutHeadline', 'aboutRole', 'aboutBio',
                      'aboutProjectSectionTitle', 'blogTitle', 'homeIntroTitle', 'homeIntroDescription',
                      'blogDesign', 'legacyBlogScheme'
                  ]) AS key(name)
                  WHERE jsonb_typeof(published_doc -> 'content' -> key.name) <> 'string'
              ) THEN 'invalid_shape'
            WHEN EXISTS (
                  SELECT 1
                  FROM unnest(ARRAY[
                      'profileImageUrl', 'profileRole', 'profileBio', 'aboutHeadline', 'aboutRole', 'aboutBio',
                      'aboutProjectSectionTitle', 'blogTitle', 'homeIntroTitle', 'homeIntroDescription'
                  ]) AS key(name)
                  WHERE published_doc -> 'content' ->> key.name <> btrim(published_doc -> 'content' ->> key.name, kotlin_trim_chars)
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(published_doc -> 'content' -> 'aboutSections') AS item(value)
                  WHERE item.value ->> 'id' = ''
                     OR item.value ->> 'id' <> btrim(item.value ->> 'id', kotlin_trim_chars)
                     OR item.value ->> 'title' <> btrim(item.value ->> 'title', kotlin_trim_chars)
                     OR (item.value ->> 'title' = '' AND jsonb_array_length(item.value -> 'items') = 0)
                     OR EXISTS (
                         SELECT 1 FROM jsonb_array_elements(item.value -> 'items') AS section_item(value)
                         WHERE section_item.value #>> '{}' = ''
                            OR section_item.value #>> '{}' <> btrim(section_item.value #>> '{}', kotlin_trim_chars)
                     )
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(published_doc -> 'content' -> 'aboutProjects') AS item(value)
                  WHERE item.value ->> 'id' = ''
                     OR EXISTS (
                         SELECT 1 FROM unnest(ARRAY['id', 'name', 'summary', 'role', 'href', 'linkLabel']) AS key(name)
                         WHERE item.value ->> key.name <> btrim(item.value ->> key.name, kotlin_trim_chars)
                     )
                     OR (
                         item.value ->> 'name' = '' AND item.value ->> 'summary' = ''
                         AND item.value ->> 'role' = '' AND item.value ->> 'href' = ''
                     )
                     OR (item.value ->> 'href' <> '' AND item.value ->> 'linkLabel' = '')
              )
              OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(published_doc -> 'content' -> 'serviceLinks') AS item(value)
                  CROSS JOIN unnest(ARRAY['icon', 'label', 'href']) AS key(name)
                  WHERE item.value ->> key.name <> btrim(item.value ->> key.name, kotlin_trim_chars)
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(published_doc -> 'content' -> 'serviceLinks') AS item(value)
                  WHERE item.value ->> 'icon' NOT IN (
                      'service', 'briefcase', 'laptop', 'rocket', 'spark', 'search', 'tag', 'camera', 'question'
                  )
                     OR item.value ->> 'label' = ''
                     OR item.value ->> 'href' = ''
              )
              OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(published_doc -> 'content' -> 'contactLinks') AS item(value)
                  CROSS JOIN unnest(ARRAY['icon', 'label', 'href']) AS key(name)
                  WHERE item.value ->> key.name <> btrim(item.value ->> key.name, kotlin_trim_chars)
              )
              OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(published_doc -> 'content' -> 'contactLinks') AS item(value)
                  WHERE item.value ->> 'icon' NOT IN (
                      'github', 'linkedin', 'mail', 'message', 'kakao', 'instagram', 'globe', 'link', 'phone', 'bell'
                  )
                     OR item.value ->> 'label' = ''
                     OR item.value ->> 'href' = ''
              )
              OR (published_doc -> 'content' ->> 'blogDesign') <> CASE
                  WHEN lower(btrim(published_doc -> 'content' ->> 'blogDesign', kotlin_trim_chars)) = 'grid' THEN 'grid'
                  ELSE 'legacy'
              END
              OR (published_doc -> 'content' ->> 'legacyBlogScheme') <> CASE
                  WHEN lower(btrim(published_doc -> 'content' ->> 'legacyBlogScheme', kotlin_trim_chars)) = 'light' THEN 'light'
                  ELSE 'dark'
              END THEN 'noncanonical'
            ELSE 'canonical'
        END AS published_state
    FROM parsed
),
semantic_projection AS (
    SELECT
        classified.*,
        draft_doc -> 'content' AS draft_content,
        published_doc -> 'content' AS published_content
    FROM classified
),
draft_legacy_projection AS (
    SELECT
        semantic_projection.*,
        COALESCE((
            SELECT string_agg(
                CASE WHEN section_ordinal > 1 THEN E'\n\n' ELSE '' END ||
                CASE
                    WHEN section_ordinal > 1 AND section_value ->> 'dividerBefore' = 'true'
                        THEN E'---\n\n'
                    ELSE ''
                END ||
                concat_ws(
                    E'\n',
                    CASE
                        WHEN section_value ->> 'title' <> ''
                            THEN '## ' || (section_value ->> 'title')
                    END,
                    (
                        SELECT string_agg('- ' || (item_value #>> '{}'), E'\n' ORDER BY item_ordinal)
                        FROM jsonb_array_elements(
                            CASE
                                WHEN jsonb_typeof(section_value -> 'items') = 'array'
                                    THEN section_value -> 'items'
                                ELSE '[]'::jsonb
                            END
                        ) WITH ORDINALITY AS item(item_value, item_ordinal)
                    )
                ),
                '' ORDER BY section_ordinal
            )
            FROM jsonb_array_elements(
                CASE
                    WHEN draft_state = 'canonical' THEN draft_content -> 'aboutSections'
                    ELSE '[]'::jsonb
                END
            ) WITH ORDINALITY AS section(section_value, section_ordinal)
        ), '') AS expected_legacy_about_details
    FROM semantic_projection
)
SELECT
    current_setting('transaction_read_only')::boolean AS read_only,
    COUNT(*)::bigint AS total_member_count,
    COUNT(*) FILTER (WHERE active)::bigint AS active_member_count,
    COUNT(*) FILTER (WHERE NOT active)::bigint AS deleted_member_count,
    COUNT(*) FILTER (WHERE draft_state = 'missing')::bigint AS draft_missing_count,
    COUNT(*) FILTER (WHERE draft_state = 'blank')::bigint AS draft_blank_count,
    COUNT(*) FILTER (WHERE draft_state IN ('invalid_json', 'invalid_shape'))::bigint AS draft_invalid_count,
    COUNT(*) FILTER (WHERE draft_state = 'noncanonical')::bigint AS draft_noncanonical_count,
    COUNT(*) FILTER (WHERE draft_state = 'canonical')::bigint AS draft_canonical_count,
    COUNT(*) FILTER (WHERE published_state = 'missing')::bigint AS published_missing_count,
    COUNT(*) FILTER (WHERE published_state = 'blank')::bigint AS published_blank_count,
    COUNT(*) FILTER (WHERE published_state IN ('invalid_json', 'invalid_shape'))::bigint AS published_invalid_count,
    COUNT(*) FILTER (WHERE published_state = 'noncanonical')::bigint AS published_noncanonical_count,
    COUNT(*) FILTER (WHERE published_state = 'canonical')::bigint AS published_valid_count,
    COUNT(*) FILTER (WHERE draft_state = 'canonical' AND published_state = 'canonical' AND draft_content IS DISTINCT FROM published_content)::bigint AS draft_published_different_count,
    COUNT(*) FILTER (
        WHERE draft_state = 'canonical'
          AND draft_content ->> 'profileImageUrl' = btrim(legacy_profile_image_url, kotlin_trim_chars)
    )::bigint AS draft_image_parity_count,
    COUNT(*) FILTER (
        WHERE draft_state = 'canonical'
          AND (
              draft_content ->> 'profileImageUrl' <> btrim(legacy_profile_image_url, kotlin_trim_chars)
              OR draft_content ->> 'profileRole' <> btrim(legacy_profile_role, kotlin_trim_chars)
              OR draft_content ->> 'profileBio' <> btrim(legacy_profile_bio, kotlin_trim_chars)
              OR draft_content ->> 'aboutRole' <> btrim(legacy_about_role, kotlin_trim_chars)
              OR draft_content ->> 'aboutBio' <> btrim(legacy_about_bio, kotlin_trim_chars)
              OR draft_content ->> 'blogTitle' <> btrim(legacy_blog_title, kotlin_trim_chars)
              OR draft_content ->> 'homeIntroTitle' <> btrim(legacy_home_intro_title, kotlin_trim_chars)
              OR draft_content ->> 'homeIntroDescription' <> btrim(legacy_home_intro_description, kotlin_trim_chars)
              OR draft_content ->> 'blogDesign' <> CASE WHEN lower(btrim(legacy_blog_design, kotlin_trim_chars)) = 'grid' THEN 'grid' ELSE 'legacy' END
              OR draft_content ->> 'legacyBlogScheme' <> CASE WHEN lower(btrim(legacy_blog_scheme, kotlin_trim_chars)) = 'light' THEN 'light' ELSE 'dark' END
              OR legacy_about_details <> expected_legacy_about_details
              OR legacy_service_links IS DISTINCT FROM draft_content -> 'serviceLinks'
              OR legacy_contact_links IS DISTINCT FROM draft_content -> 'contactLinks'
          )
    )::bigint AS legacy_workspace_mismatch_count,
    COUNT(*) = COUNT(*) FILTER (WHERE active) + COUNT(*) FILTER (WHERE NOT active) AS lifecycle_partition_ok,
    COUNT(*) = COUNT(*) FILTER (WHERE draft_state = 'missing') + COUNT(*) FILTER (WHERE draft_state = 'blank') + COUNT(*) FILTER (WHERE draft_state IN ('invalid_json', 'invalid_shape')) + COUNT(*) FILTER (WHERE draft_state = 'noncanonical') + COUNT(*) FILTER (WHERE draft_state = 'canonical') AS draft_partition_ok,
    COUNT(*) = COUNT(*) FILTER (WHERE published_state = 'missing') + COUNT(*) FILTER (WHERE published_state = 'blank') + COUNT(*) FILTER (WHERE published_state IN ('invalid_json', 'invalid_shape')) + COUNT(*) FILTER (WHERE published_state = 'noncanonical') + COUNT(*) FILTER (WHERE published_state = 'canonical') AS published_partition_ok
FROM draft_legacy_projection;

ROLLBACK;
