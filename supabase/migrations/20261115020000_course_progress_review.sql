-- SIG-1351: per-line spaced review schedule on course_progress.
-- course_id is nullable and NOT backfilled (variation ids can collide between
-- courses); the client writes it from now on, only for DB courses.
-- Table-level grants already cover the new columns; RLS policies are row-based.
alter table public.course_progress
  add column if not exists course_id uuid references public.courses (id) on delete cascade,
  add column if not exists review_level smallint not null default 0
    check (review_level between 0 and 7),
  add column if not exists review_due_at timestamptz,
  add column if not exists last_reviewed_at timestamptz;

create index if not exists course_progress_user_review_due_idx
  on public.course_progress (user_id, review_due_at)
  where review_due_at is not null;
