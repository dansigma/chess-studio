-- SIG-1088: per-user imported games (My Games 2/5). Recent public games
-- fetched incrementally by `POST /api/my-games/sync` from the user's linked
-- Lichess / Chess.com accounts. Dedupe scope is (user, source, external game id).
create table if not exists public.my_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('lichess', 'chesscom')),
  external_id text not null,
  played_at timestamptz,
  color text check (color in ('white', 'black')),
  result text check (result in ('win', 'loss', 'draw')),
  time_class text,
  white text,
  black text,
  white_elo integer,
  black_elo integer,
  eco text,
  opening text,
  ply_count integer,
  pgn text not null check (octet_length(pgn) <= 1000000),
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index if not exists my_games_user_played_idx
  on public.my_games (user_id, played_at desc);
alter table public.my_games enable row level security;
create policy "my_games_select_own" on public.my_games
  for select using ((select auth.uid()) = user_id);
create policy "my_games_insert_own" on public.my_games
  for insert with check ((select auth.uid()) = user_id);
create policy "my_games_delete_own" on public.my_games
  for delete using ((select auth.uid()) = user_id);
grant select, insert, delete on public.my_games to authenticated;
