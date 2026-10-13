create table if not exists public.repertoire_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.repertoire_progress enable row level security;
create policy "repertoire_progress_select_own" on public.repertoire_progress
  for select using ((select auth.uid()) = user_id);
create policy "repertoire_progress_insert_own" on public.repertoire_progress
  for insert with check ((select auth.uid()) = user_id);
create policy "repertoire_progress_update_own" on public.repertoire_progress
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.repertoire_progress to authenticated;
alter table public.repertoire_progress add constraint repertoire_progress_data_size check (pg_column_size(data) < 262144);
