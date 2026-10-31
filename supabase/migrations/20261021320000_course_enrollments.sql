-- SIG-1052: record course enrollments and completions.
--
-- Lesson progress lives in course_progress keyed by variation_id, which has no
-- course link in SQL by design, so the admin dashboard / coach area cannot
-- answer "students and completions per course". This table records, per
-- signed-in user and course, the first open (first_opened_at) and the moment
-- every lesson reached 100% learned (completed_at, set once, never cleared).
--
-- Writes come from the browser client under own-row RLS, same grain as
-- course_progress and repertoire_progress. Anonymous visitors are never
-- counted (no anon grants); history is append-only (no delete policy).
-- The client tolerates the unique-violation on concurrent first opens and
-- only sets completed_at while it is still null, so both writes converge.

create table if not exists public.course_enrollments (
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  first_opened_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, course_id)
);

create index if not exists course_enrollments_course_id_idx
  on public.course_enrollments (course_id);

alter table public.course_enrollments enable row level security;

create policy "course_enrollments_select_own" on public.course_enrollments
  for select using ((select auth.uid()) = user_id);
create policy "course_enrollments_insert_own" on public.course_enrollments
  for insert with check ((select auth.uid()) = user_id);
create policy "course_enrollments_update_own" on public.course_enrollments
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.course_enrollments to authenticated;
