-- SIG-1275: position index for My Games (Library 8/10).
--
-- Mirrors public.game_positions for imported PGNs: one row per (game, ply) with
-- the Zobrist-style position key (src/chess/zobrist.ts) of the position *before*
-- that ply, plus one trailing row for the final position (ply >= 1000001, same
-- convention as rowsForTree in src/lib/position-index.ts).
--
-- Writes happen on the server only (sync route + backfill route, service role,
-- which bypasses RLS). Clients get select on their own games and no write
-- policy at all. Rows are small (ply + bigint): ~3,000 games/user is about
-- 240,000 rows. The per-user quota is enforced by capping rows per game in the
-- indexer (MAX_POSITIONS_PER_GAME) and by the check constraint below; the
-- number of games per user is already bounded by sync (200 games per call).
--
-- Rollout: apply this migration BEFORE deploying the app code. Existing games
-- start with indexed_at = null and are picked up by POST /api/my-games/index.

alter table public.my_games
  add column if not exists indexed_at timestamptz;

create index if not exists my_games_unindexed_idx
  on public.my_games (user_id)
  where indexed_at is null;

create table if not exists public.my_game_positions (
  game_id uuid not null references public.my_games (id) on delete cascade,
  ply integer not null check (ply >= 0 and ply <= 1001200),
  zkey bigint not null,
  primary key (game_id, ply)
);

create index if not exists my_game_positions_zkey_idx
  on public.my_game_positions (zkey);

alter table public.my_game_positions enable row level security;

create policy "my_game_positions_select_own" on public.my_game_positions
  for select using (
    exists (
      select 1
      from public.my_games g
      where g.id = my_game_positions.game_id
        and g.user_id = (select auth.uid())
    )
  );

-- Read-only for clients. No insert/update/delete policy: the server writes
-- with the service role.
grant select on public.my_game_positions to authenticated;

-- Games of the caller that reach a position, combined with the other My Games
-- filters. Security invoker, so RLS on my_games and my_game_positions applies.
-- p_color: side played by the account owner ('white' | 'black' | null = both).
-- p_result: 'win' | 'loss' | 'draw' | null, from the owner's point of view.
create or replace function public.my_games_at_position(
  p_zkey bigint,
  p_color text default null,
  p_result text default null,
  p_opponent text default null,
  p_query text default null
)
returns table (id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select g.id
  from public.my_games g
  where g.user_id = (select auth.uid())
    and exists (
      select 1 from public.my_game_positions p
      where p.game_id = g.id and p.zkey = p_zkey
    )
    and (p_color is null or g.color = p_color)
    and (p_result is null or g.result = p_result)
    and (
      p_opponent is null
      or (case g.color
            when 'white' then g.black
            when 'black' then g.white
            else null
          end) ilike '%' || replace(replace(replace(p_opponent, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
    and (
      p_query is null
      or g.white ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or g.black ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or g.opening ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or g.eco ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    );
$$;

revoke execute on function public.my_games_at_position(bigint, text, text, text, text) from public, anon;
grant execute on function public.my_games_at_position(bigint, text, text, text, text) to authenticated;
