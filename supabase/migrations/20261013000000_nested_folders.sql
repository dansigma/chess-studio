create table if not exists public.user_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  parent_id uuid references public.user_folders (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists user_folders_user_idx
  on public.user_folders (user_id);
create index if not exists user_folders_parent_idx
  on public.user_folders (parent_id);

alter table public.user_folders enable row level security;

create policy "user_folders_select_own" on public.user_folders
  for select using (auth.uid() = user_id);
create policy "user_folders_insert_own" on public.user_folders
  for insert with check (auth.uid() = user_id);
create policy "user_folders_update_own" on public.user_folders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_folders_delete_own" on public.user_folders
  for delete using (auth.uid() = user_id);

alter table public.game_databases
  add column if not exists folder_id uuid references public.user_folders (id) on delete set null;

create index if not exists game_databases_folder_idx
  on public.game_databases (folder_id);
