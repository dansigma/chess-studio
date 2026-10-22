-- SIG-1039: linked external chess accounts (My Games 1/5). One row per
-- (user, source): the signed-in user's public Lichess / Chess.com username.
-- No OAuth; later slices read these names to auto-import public games.
create table if not exists public.linked_accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('lichess', 'chesscom')),
  username text not null check (username ~ '^[A-Za-z0-9_-]{2,30}$'),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, source)
);
alter table public.linked_accounts enable row level security;
create policy "linked_accounts_select_own" on public.linked_accounts
  for select using ((select auth.uid()) = user_id);
create policy "linked_accounts_insert_own" on public.linked_accounts
  for insert with check ((select auth.uid()) = user_id);
create policy "linked_accounts_update_own" on public.linked_accounts
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "linked_accounts_delete_own" on public.linked_accounts
  for delete using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.linked_accounts to authenticated;
