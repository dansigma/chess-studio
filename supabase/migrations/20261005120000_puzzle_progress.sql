create table if not exists public.puzzle_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.puzzle_progress enable row level security;
create policy "puzzle_progress_select_own" on public.puzzle_progress
  for select using ((select auth.uid()) = user_id);
create policy "puzzle_progress_insert_own" on public.puzzle_progress
  for insert with check ((select auth.uid()) = user_id);
create policy "puzzle_progress_update_own" on public.puzzle_progress
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.puzzle_progress to authenticated;
alter table public.puzzle_progress add constraint puzzle_progress_data_size check (pg_column_size(data) < 262144);
