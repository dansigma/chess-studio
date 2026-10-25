create table if not exists public.mistake_exercises (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.mistake_exercises enable row level security;
create policy "mistake_exercises_select_own" on public.mistake_exercises
  for select using ((select auth.uid()) = user_id);
create policy "mistake_exercises_insert_own" on public.mistake_exercises
  for insert with check ((select auth.uid()) = user_id);
create policy "mistake_exercises_update_own" on public.mistake_exercises
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.mistake_exercises to authenticated;
alter table public.mistake_exercises add constraint mistake_exercises_data_size check (pg_column_size(data) < 262144);
