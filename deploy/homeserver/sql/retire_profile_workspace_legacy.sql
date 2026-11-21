\if :{?cutover_sha}
\else
\quit 3
\endif
\if :{?expected_marker_sha}
\else
\quit 3
\endif

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

LOCK TABLE public.member IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.member_attr IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION pg_temp.profile_workspace_inventory_canonical(raw_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $function$
DECLARE
    document JSONB;
    content JSONB;
    trim_chars CONSTANT TEXT := chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32);
BEGIN
    IF raw_value IS NULL
       OR btrim(raw_value, trim_chars) = ''
       OR NOT pg_input_is_valid(raw_value, 'jsonb') THEN
        RETURN FALSE;
    END IF;

    document := raw_value::jsonb;
    IF jsonb_typeof(document) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(document)) <> 1
       OR NOT document ? 'content'
       OR jsonb_typeof(document -> 'content') <> 'object' THEN
        RETURN FALSE;
    END IF;

    content := document -> 'content';
    IF NOT content ?& ARRAY[
        'profileImageUrl', 'profileRole', 'profileBio', 'aboutHeadline', 'aboutRole', 'aboutBio',
        'aboutSections', 'aboutProjectSectionTitle', 'aboutProjects', 'blogTitle', 'homeIntroTitle',
        'homeIntroDescription', 'blogDesign', 'legacyBlogScheme', 'serviceLinks', 'contactLinks'
    ]
       OR (SELECT count(*) FROM jsonb_object_keys(content)) <> 16
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'profileImageUrl', 'profileRole', 'profileBio', 'aboutHeadline', 'aboutRole', 'aboutBio',
               'aboutProjectSectionTitle', 'blogTitle', 'homeIntroTitle', 'homeIntroDescription',
               'blogDesign', 'legacyBlogScheme'
           ]) AS key(name)
           WHERE jsonb_typeof(content -> key.name) <> 'string'
              OR content ->> key.name <> btrim(content ->> key.name, trim_chars)
       )
       OR content ->> 'blogDesign' NOT IN ('grid', 'legacy')
       OR content ->> 'legacyBlogScheme' NOT IN ('light', 'dark')
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY['aboutSections', 'aboutProjects', 'serviceLinks', 'contactLinks']) AS key(name)
           WHERE jsonb_typeof(content -> key.name) <> 'array'
       ) THEN
        RETURN FALSE;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(content -> 'aboutSections') AS item(value)
        WHERE jsonb_typeof(item.value) <> 'object'
           OR (SELECT count(*) FROM jsonb_object_keys(
               CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
           )) <> 4
           OR NOT item.value ?& ARRAY['id', 'title', 'items', 'dividerBefore']
           OR jsonb_typeof(item.value -> 'id') <> 'string'
           OR jsonb_typeof(item.value -> 'title') <> 'string'
           OR jsonb_typeof(item.value -> 'items') <> 'array'
           OR jsonb_typeof(item.value -> 'dividerBefore') <> 'boolean'
           OR item.value ->> 'id' = ''
           OR item.value ->> 'id' <> btrim(item.value ->> 'id', trim_chars)
           OR item.value ->> 'title' <> btrim(item.value ->> 'title', trim_chars)
           OR (
               item.value ->> 'title' = ''
               AND jsonb_array_length(
                   CASE WHEN jsonb_typeof(item.value -> 'items') = 'array'
                       THEN item.value -> 'items' ELSE '[]'::jsonb END
               ) = 0
           )
           OR EXISTS (
               SELECT 1
               FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(item.value -> 'items') = 'array'
                       THEN item.value -> 'items' ELSE '[]'::jsonb END
               ) AS section_item(value)
               WHERE jsonb_typeof(section_item.value) <> 'string'
                  OR section_item.value #>> '{}' = ''
                  OR section_item.value #>> '{}' <> btrim(section_item.value #>> '{}', trim_chars)
           )
    ) THEN
        RETURN FALSE;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(content -> 'aboutProjects') AS item(value)
        WHERE jsonb_typeof(item.value) <> 'object'
           OR (SELECT count(*) FROM jsonb_object_keys(
               CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
           )) <> 6
           OR NOT item.value ?& ARRAY['id', 'name', 'summary', 'role', 'href', 'linkLabel']
           OR EXISTS (
               SELECT 1
               FROM unnest(ARRAY['id', 'name', 'summary', 'role', 'href', 'linkLabel']) AS key(name)
               WHERE jsonb_typeof(item.value -> key.name) <> 'string'
                  OR item.value ->> key.name <> btrim(item.value ->> key.name, trim_chars)
           )
           OR item.value ->> 'id' = ''
           OR (
               item.value ->> 'name' = ''
               AND item.value ->> 'summary' = ''
               AND item.value ->> 'role' = ''
               AND item.value ->> 'href' = ''
           )
           OR (item.value ->> 'href' <> '' AND item.value ->> 'linkLabel' = '')
    ) THEN
        RETURN FALSE;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(content -> 'serviceLinks') AS item(value)
        WHERE jsonb_typeof(item.value) <> 'object'
           OR (SELECT count(*) FROM jsonb_object_keys(
               CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
           )) <> 3
           OR NOT item.value ?& ARRAY['icon', 'label', 'href']
           OR EXISTS (
               SELECT 1
               FROM unnest(ARRAY['icon', 'label', 'href']) AS key(name)
               WHERE jsonb_typeof(item.value -> key.name) <> 'string'
                  OR item.value ->> key.name <> btrim(item.value ->> key.name, trim_chars)
           )
           OR item.value ->> 'icon' NOT IN (
               'service', 'briefcase', 'laptop', 'rocket', 'spark', 'search', 'tag', 'camera', 'question'
           )
           OR item.value ->> 'label' = ''
           OR item.value ->> 'href' = ''
    ) THEN
        RETURN FALSE;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(content -> 'contactLinks') AS item(value)
        WHERE jsonb_typeof(item.value) <> 'object'
           OR (SELECT count(*) FROM jsonb_object_keys(
               CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
           )) <> 3
           OR NOT item.value ?& ARRAY['icon', 'label', 'href']
           OR EXISTS (
               SELECT 1
               FROM unnest(ARRAY['icon', 'label', 'href']) AS key(name)
               WHERE jsonb_typeof(item.value -> key.name) <> 'string'
                  OR item.value ->> key.name <> btrim(item.value ->> key.name, trim_chars)
           )
           OR item.value ->> 'icon' NOT IN (
               'github', 'linkedin', 'mail', 'message', 'kakao', 'instagram', 'globe', 'link', 'phone', 'bell'
           )
           OR item.value ->> 'label' = ''
           OR item.value ->> 'href' = ''
    ) THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$function$;

SELECT set_config('app.profile_workspace_cutover_sha', :'cutover_sha', true) AS configured_cutover_sha \gset
SELECT set_config('app.profile_workspace_expected_marker_sha', :'expected_marker_sha', true) AS configured_expected_marker_sha \gset

DO $block$
DECLARE
    requested_sha TEXT := current_setting('app.profile_workspace_cutover_sha', true);
    expected_sha TEXT := current_setting('app.profile_workspace_expected_marker_sha', true);
    existing_sha TEXT;
BEGIN
    IF requested_sha !~ '^[0-9a-f]{40}$' THEN
        RAISE EXCEPTION 'profile workspace cutover source SHA must be lowercase 40-hex';
    END IF;
    IF expected_sha !~ '^[0-9a-f]{40}$' THEN
        RAISE EXCEPTION 'profile workspace expected marker SHA must be lowercase 40-hex';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.member AS member_row
        WHERE member_row.deleted_at IS NULL
          AND (
              (SELECT count(*) FROM public.member_attr WHERE subject_id = member_row.id AND name = 'profileWorkspaceDraft') <> 1
              OR (SELECT count(*) FROM public.member_attr WHERE subject_id = member_row.id AND name = 'profileWorkspacePublished') <> 1
              OR NOT pg_temp.profile_workspace_inventory_canonical((
                  SELECT str_value FROM public.member_attr
                  WHERE subject_id = member_row.id AND name = 'profileWorkspaceDraft'
              ))
              OR NOT pg_temp.profile_workspace_inventory_canonical((
                  SELECT str_value FROM public.member_attr
                  WHERE subject_id = member_row.id AND name = 'profileWorkspacePublished'
              ))
          )
    ) THEN
        RAISE EXCEPTION 'profile workspace legacy retirement requires inventory-canonical draft and published snapshots for every active member';
    END IF;

    SELECT source_sha
    INTO existing_sha
    FROM public.platform_schema_cutover
    WHERE cutover_id = 'profile-workspace-legacy-attrs';

    IF existing_sha IS NOT NULL THEN
        IF existing_sha <> expected_sha THEN
            RAISE EXCEPTION 'profile workspace cutover marker changed before retirement';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM public.member_attr
            WHERE name IN (
                'profileImgUrl', 'profileRole', 'profileBio', 'aboutRole', 'aboutBio', 'aboutDetails',
                'blogTitle', 'homeIntroTitle', 'homeIntroDescription', 'blogDesign', 'legacyBlogScheme',
                'profileServiceLinks', 'profileContactLinks'
            )
        ) THEN
            RAISE EXCEPTION 'profile workspace retired attributes were reintroduced after cutover';
        END IF;
        RETURN;
    END IF;

    IF requested_sha <> expected_sha THEN
        RAISE EXCEPTION 'profile workspace first cutover marker does not match the requested source';
    END IF;

    DELETE FROM public.member_attr
    WHERE name IN (
        'profileImgUrl', 'profileRole', 'profileBio', 'aboutRole', 'aboutBio', 'aboutDetails',
        'blogTitle', 'homeIntroTitle', 'homeIntroDescription', 'blogDesign', 'legacyBlogScheme',
        'profileServiceLinks', 'profileContactLinks'
    );

    IF EXISTS (
        SELECT 1
        FROM public.member_attr
        WHERE name IN (
            'profileImgUrl', 'profileRole', 'profileBio', 'aboutRole', 'aboutBio', 'aboutDetails',
            'blogTitle', 'homeIntroTitle', 'homeIntroDescription', 'blogDesign', 'legacyBlogScheme',
            'profileServiceLinks', 'profileContactLinks'
        )
    ) THEN
        RAISE EXCEPTION 'profile workspace legacy retirement did not reach zero';
    END IF;

    INSERT INTO public.platform_schema_cutover (cutover_id, source_sha)
    VALUES ('profile-workspace-legacy-attrs', requested_sha);
END;
$block$;

COMMIT;
