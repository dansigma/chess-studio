-- Studio schema: saved boards, settings, explorer cache, and Phase 2 opening DB tables.

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Board',
  pgn text not null default '',
  current_node_path integer[] not null default '{}',
  orientation text not null default 'white' check (orientation in ('white', 'black')),
  updated_at timestamptz not null default now()
);

create index if not exists boards_user_updated_idx
  on public.boards (user_id, updated_at desc);

alter table public.boards enable row level security;

create policy "boards_select_own" on public.boards
  for select using (auth.uid() = user_id);
create policy "boards_insert_own" on public.boards
  for insert with check (auth.uid() = user_id);
create policy "boards_update_own" on public.boards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "boards_delete_own" on public.boards
  for delete using (auth.uid() = user_id);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  show_coordinates boolean not null default true,
  piece_theme text not null default 'default',
  board_theme text not null default 'studio',
  layout jsonb,
  engine_depth integer not null default 22,
  multi_pv integer not null default 2
);

alter table public.user_settings enable row level security;

create policy "settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.explorer_cache (
  source text not null,
  fen text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (source, fen)
);

alter table public.explorer_cache enable row level security;

create policy "explorer_cache_select" on public.explorer_cache
  for select using (true);
create policy "explorer_cache_insert" on public.explorer_cache
  for insert with check (true);
create policy "explorer_cache_update" on public.explorer_cache
  for update using (true) with check (true);

create table if not exists public.game_databases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('ultra', 'online', 'personal')),
  game_count integer not null default 0
);

create index if not exists game_databases_user_idx on public.game_databases (user_id);

alter table public.game_databases enable row level security;

create policy "game_databases_select" on public.game_databases
  for select using (user_id is null or auth.uid() = user_id);
create policy "game_databases_insert_own" on public.game_databases
  for insert with check (auth.uid() = user_id);
create policy "game_databases_update_own" on public.game_databases
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "game_databases_delete_own" on public.game_databases
  for delete using (auth.uid() = user_id);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  database_id uuid not null references public.game_databases (id) on delete cascade,
  white text not null,
  black text not null,
  white_elo integer,
  black_elo integer,
  event text,
  date date,
  eco text,
  opening text,
  result text,
  ply_count integer,
  pgn text not null
);

create index if not exists games_database_idx on public.games (database_id);

alter table public.games enable row level security;

create policy "games_select" on public.games
  for select using (
    exists (
      select 1 from public.game_databases d
      where d.id = games.database_id
        and (d.user_id is null or d.user_id = auth.uid())
    )
  );

create table if not exists public.game_positions (
  game_id uuid not null references public.games (id) on delete cascade,
  ply integer not null,
  zkey bigint not null,
  next_uci text,
  primary key (game_id, ply)
);

create index if not exists game_positions_zkey_idx on public.game_positions (zkey);

alter table public.game_positions enable row level security;

create policy "game_positions_select" on public.game_positions
  for select using (
    exists (
      select 1
      from public.games g
      join public.game_databases d on d.id = g.database_id
      where g.id = game_positions.game_id
        and (d.user_id is null or d.user_id = auth.uid())
    )
  );

create table if not exists public.position_stats (
  database_id uuid not null references public.game_databases (id) on delete cascade,
  zkey bigint not null,
  next_uci text not null,
  games integer not null default 0,
  white_wins integer not null default 0,
  draws integer not null default 0,
  black_wins integer not null default 0,
  primary key (database_id, zkey, next_uci)
);

alter table public.position_stats enable row level security;

create policy "position_stats_select" on public.position_stats
  for select using (
    exists (
      select 1 from public.game_databases d
      where d.id = position_stats.database_id
        and (d.user_id is null or d.user_id = auth.uid())
    )
  );
