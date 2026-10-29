-- SIG-1052 (merged from SIG-1118): gated course content and the
-- can_access_course SQL function.
--
-- Lesson content moves to its own table whose read policy calls one SQL
-- function. The public courses row keeps a content-free outline (chapter
-- and variation titles, no PGN). courses.chapters stays untouched as the
-- authoring write target: an insert/update trigger keeps outline and
-- course_content in sync from then on.
--
-- Access rules (public.can_access_course): true when the caller owns the
-- course, or the caller's profiles.role = 'admin', or the caller holds a
-- paid purchase of that course (any tier, any status other than
-- refunded/chargeback), or the course is published and (access_tier =
-- 'free', or premium with a live subscription: status <> 'canceled' and
-- current_period_end > now() - interval '3 days', or a canceled
-- subscription whose current_period_end > now()). Otherwise false,
-- including anonymous callers on non-free courses and every draft for
-- non-owners. A purchase grants access regardless of later tier changes
-- (no tier check on the purchase path); a refund removes it.

-- ============ Section A: outline column + backfill ============

alter table public.courses add column if not exists outline jsonb not null default '[]'::jsonb;

-- ============ Section B: private.course_outline helper ============

create schema if not exists private;

-- Reduces every chapter variation to {id, title} (drops the PGN payload).
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

-- ============ Section C: course_content table ============

create table if not exists public.course_content (
  course_id uuid primary key references public.courses (id) on delete cascade,
  chapters jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.course_content enable row level security;

grant select on public.course_content to anon, authenticated;

-- ============ Section D: backfill ============

update public.courses
set outline = private.course_outline(chapters)
where outline = '[]'::jsonb;

insert into public.course_content (course_id, chapters)
select id, chapters from public.courses
on conflict (course_id) do nothing;

-- ============ Section E: sync trigger ============

-- Keeps outline and course_content in sync on authoring writes to
-- courses.chapters. AFTER trigger: course_content references courses, so an
-- insert-time write would violate the FK before the course row exists.
-- Security definer: runs as the function owner, so the private helper and
-- sync writes work no matter which role (service_role today, a writer role
-- tomorrow) performs the authoring write. Empty search_path. The function
-- is trigger-only: revoke execute from every client role, and grant nothing
-- so it is not callable directly. Note it does not guard against direct
-- out-of-band writes to outline/course_content — those stay internal-only.
create or replace function public.courses_sync_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.courses
    set outline = private.course_outline(new.chapters)
    where id = new.id;
  insert into public.course_content (course_id, chapters, updated_at)
  values (new.id, new.chapters, now())
  on conflict (course_id) do update
    set chapters = excluded.chapters, updated_at = excluded.updated_at;
  -- AFTER trigger: return value is ignored, but NEW keeps the row.
  return new;
end;
$$;

drop trigger if exists courses_sync_content on public.courses;
create trigger courses_sync_content
  after insert or update of chapters on public.courses
  for each row execute function public.courses_sync_content();

revoke all on function public.courses_sync_content() from public, anon, authenticated;

-- ============ Section F: can_access_course ============

-- Security definer so the RLS policy on course_content can evaluate
-- subscriptions/course_purchases/profiles without granting direct reads
-- on those tables to anon/authenticated.
create or replace function public.can_access_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = p_course_id
      and (
        -- Owner (includes drafts). Plain = fails closed when created_by is
        -- NULL: anonymous callers own nothing, so ownerless rows grant them
        -- nothing via this clause. (A NULL created_by row can still be
        -- visible through the free/premium tiers below; see the
        -- orphan-course regression case.)
        c.created_by = (select auth.uid())
        -- Admin.
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
        -- Paid purchase of this course, any tier; refunded/chargeback
        -- purchases grant nothing.
        or exists (
          select 1 from public.course_purchases cp
          where cp.course_id = p_course_id
            and cp.user_id = (select auth.uid())
            and cp.status = 'paid'
        )
        -- Public tiers on published rows.
        or (
          c.status = 'published'
          and (
            c.access_tier = 'free'
            or (
              c.access_tier = 'premium'
              and exists (
                select 1 from public.subscriptions s
                where s.user_id = (select auth.uid())
                  and (
                    (s.status <> 'canceled' and s.current_period_end > now() - interval '3 days')
                    or s.current_period_end > now()
                  )
              )
            )
          )
        )
      )
  );
$$;

revoke all on function public.can_access_course(uuid) from public;
grant execute on function public.can_access_course(uuid) to anon, authenticated;

-- ============ Section G: course_content read policy ============

drop policy if exists "course_content_select" on public.course_content;
create policy "course_content_select" on public.course_content
  for select to anon, authenticated
  using (public.can_access_course(course_id));

-- No insert/update/delete policies: writes go through the service role only.
