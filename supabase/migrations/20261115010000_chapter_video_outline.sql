-- SIG-1350: the public outline tells which chapters have a video lesson.
-- Only a boolean `hasVideo` is exposed: never the link, the description or
-- any move text. Same signature, language, volatility, search_path and
-- grants as the original in 20261021290000_course_content_gate.sql.
create or replace function private.course_outline(chapters jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', chapter -> 'id',
        'title', chapter -> 'title',
        'hasVideo', coalesce(nullif(chapter ->> 'videoUrl', '') is not null, false),
        'variations', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object('id', variation -> 'id', 'title', variation -> 'title')
              order by ord
            )
            from jsonb_array_elements(coalesce(chapter -> 'variations', '[]'::jsonb)) with ordinality as v(variation, ord)
          ),
          '[]'::jsonb
        )
      )
      order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(chapters, '[]'::jsonb)) with ordinality as c(chapter, ord);
$$;

revoke all on function private.course_outline(jsonb) from public, anon, authenticated;

-- Backfill. The courses_sync_content trigger fires only on updates of
-- `chapters`, and courses_sync_published_at only on status/published_at,
-- so rewriting `outline` triggers neither.
update public.courses
set outline = private.course_outline(chapters);
