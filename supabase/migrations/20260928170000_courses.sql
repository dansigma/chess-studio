-- Published courses are readable by anyone. Writes go through the server, which uses
-- the service role after checking the signed-in admin. Progress belongs to the student.

create table if not exists public.courses (
  id uuid primary key,
  slug text not null unique,
  title text not null,
  summary text not null default '',
  color text not null check (color in ('white', 'black')),
  chapters jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.courses enable row level security;

create policy "courses_select_all" on public.courses
  for select using (true);

create table if not exists public.course_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  variation_id text not null check (char_length(variation_id) between 1 and 80),
  step integer not null default 0 check (step >= 0),
  learned boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, variation_id)
);

alter table public.course_progress enable row level security;

create policy "course_progress_select_own" on public.course_progress
  for select using (auth.uid() = user_id);
create policy "course_progress_insert_own" on public.course_progress
  for insert with check (auth.uid() = user_id);
create policy "course_progress_update_own" on public.course_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.courses to anon, authenticated;
grant select, insert, update on public.course_progress to authenticated;
