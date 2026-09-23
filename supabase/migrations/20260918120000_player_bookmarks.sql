create table if not exists public.player_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('lichess', 'chesscom', 'studio')),
  username text not null,
  display_name text not null,
  subtitle text not null default '',
  title text,
  created_at timestamptz not null default now(),
  unique (user_id, source, username)
);

create index if not exists player_bookmarks_user_created_idx
  on public.player_bookmarks (user_id, created_at);

alter table public.player_bookmarks enable row level security;

create policy "player_bookmarks_select_own" on public.player_bookmarks
  for select using (auth.uid() = user_id);
create policy "player_bookmarks_insert_own" on public.player_bookmarks
  for insert with check (auth.uid() = user_id);
create policy "player_bookmarks_update_own" on public.player_bookmarks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "player_bookmarks_delete_own" on public.player_bookmarks
  for delete using (auth.uid() = user_id);
