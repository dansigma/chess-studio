-- SIG-1120: column-grant test for courses.chapters.
--
-- Run with: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
--   -v ON_ERROR_STOP=1 -f supabase/tests/courses_column_grants.sql
-- Everything is rolled back at the end, so the test is side-effect free.
-- Each denied case must raise insufficient_privilege; a missing denial
-- (or a missing grant on a public column) fails the script loudly.
--
-- Requires the gate + revocation migrations:
-- 20261021290000_course_content_gate.sql, 20261021300000_courses_hide_chapters.sql.

begin;

-- Fixture: one published course with content (trigger syncs outline and
-- course_content from chapters on insert).
insert into public.courses (id, slug, title, summary, color, theme, chapters, access_tier, status)
values (
  '30000000-0000-0000-0000-000000000001', 'grant-check', 'Grants', '', 'white', 'openings',
  '[{"id":"ch1","title":"Chapter","variations":[{"id":"v1","title":"Line","pgn":"1. e4 e5"}]}]',
  'free', 'published'
);

create or replace function pg_temp.as_role(role_name text, user_id text) returns void
language plpgsql as $$
begin
  execute format('set local role %I', role_name);
  if user_id is not null then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', user_id)::text, true);
  else
    perform set_config('request.jwt.claims', '{}', true);
  end if;
end;
$$;

do $$
declare
  chapters_denied boolean;
  grant_cols text[] := array[
    'id', 'slug', 'title', 'summary', 'color', 'theme', 'cover_url',
    'video_url', 'published_at', 'status', 'review_note', 'access_tier',
    'price_cents', 'currency', 'author_display_name', 'outline',
    'created_by', 'updated_at'
  ];
  col text;
  row_count integer;
  denied_via_star boolean;
begin
  -- anon: chapters denied, every other column readable, select * denied.
  perform pg_temp.as_role('anon', null);
  begin
    perform c.chapters from public.courses c where c.slug = 'grant-check';
    raise exception 'anon chapters read was allowed';
  exception
    when insufficient_privilege then
      raise notice 'grant check ok: anon chapters denied';
  end;
  foreach col in array grant_cols loop
    execute format('select count(*) from public.courses where slug = %L', 'grant-check') into row_count;
    if row_count < 1 then
      raise exception 'anon cannot read published row (col %)', col;
    end if;
    execute format('select %I from public.courses where slug = %L limit 1', col, 'grant-check');
  end loop;
  raise notice 'grant check ok: anon reads the other columns';
  begin
    perform * from public.courses where slug = 'grant-check';
    raise exception 'anon select * was allowed';
  exception
    when insufficient_privilege then
      denied_via_star := true;
      raise notice 'grant check ok: anon select * denied';
  end;

  -- authenticated: same split.
  perform pg_temp.as_role('authenticated', '40000000-0000-0000-0000-000000000001');
  begin
    perform c.chapters from public.courses c where c.slug = 'grant-check';
    raise exception 'authenticated chapters read was allowed';
  exception
    when insufficient_privilege then
      raise notice 'grant check ok: authenticated chapters denied';
  end;
  foreach col in array grant_cols loop
    execute format('select %I from public.courses where slug = %L limit 1', col, 'grant-check');
  end loop;
  raise notice 'grant check ok: authenticated reads the other columns';

  -- Outline carries no move text: the public static payload is titles only.
  perform pg_temp.as_role('anon', null);
  if exists (
    select 1 from public.courses
    where slug = 'grant-check' and outline::text ~ '[1-9]\.\s*[a-hNBRQKO]'
  ) then
    raise exception 'outline leaks move text';
  end if;
  raise notice 'grant check ok: outline has no move text';

  -- course_content still gates full chapters: anon sees the free row
  -- through can_access_course.
  if not exists (select 1 from public.course_content where course_id = '30000000-0000-0000-0000-000000000001') then
    raise exception 'course_content backfill missing';
  end if;
  raise notice 'grant check ok: course_content backfilled';
end;
$$;

reset role;

rollback;
