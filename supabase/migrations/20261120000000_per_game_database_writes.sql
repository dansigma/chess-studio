create or replace function public.max_games_per_database()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 5000 $$;

revoke execute on function public.max_games_per_database() from public, anon;
grant execute on function public.max_games_per_database() to authenticated, service_role;

create or replace function public.check_database_game_quota()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Serialize the count with other writes to this database.
  perform 1 from public.game_databases where id = new.database_id for update;
  if (select count(*) from public.games where database_id = new.database_id and not pending)
      >= public.max_games_per_database() then
    raise exception using errcode = 'P0001', message = 'quota_games';
  end if;
  return new;
end;
$$;

create trigger games_database_quota
  before insert on public.games
  for each row when (not new.pending)
  execute function public.check_database_game_quota();

-- A single transaction covers the game, its index and the database count.
-- The database lock serializes deltas and also protects legacy PGN matching.
create or replace function public.write_database_game(
  p_database_id uuid,
  p_game_id uuid,
  p_operation text,
  p_game jsonb,
  p_positions jsonb,
  p_previous_pgn text,
  p_known_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  game_row public.games;
  old_id uuid;
  old_result text;
begin
  perform 1 from public.game_databases
    where id = p_database_id and user_id = (select auth.uid()) for update;
  if not found then
    raise exception using errcode = '42501', message = 'Database is not owned by this account';
  end if;

  if p_operation = 'insert' then
    -- A retry after a lost response must not count the same game twice.
    if exists (select 1 from public.games where id = p_game_id and database_id = p_database_id and not pending) then
      return;
    end if;
  elsif p_operation in ('update', 'delete') then
    select id, result into old_id, old_result from public.games
      where id = p_game_id and database_id = p_database_id and not pending;
    if not found and p_previous_pgn is not null then
      -- Older Library caches used a separate local UUID for each imported game.
      select id, result into old_id, old_result from public.games
        where database_id = p_database_id and not pending
          and pgn = p_previous_pgn and id <> all(p_known_ids)
        order by id limit 1;
    end if;
    if old_id is null then
      if p_operation = 'delete' then
        return;
      end if;
      raise exception using errcode = 'P0001', message = 'Could not find that game in the remote database';
    end if;

    update public.position_stats s set
      games = s.games - 1,
      white_wins = s.white_wins - case when old_result = '1-0' then 1 else 0 end,
      draws = s.draws - case when coalesce(old_result, '*') not in ('1-0', '0-1') then 1 else 0 end,
      black_wins = s.black_wins - case when old_result = '0-1' then 1 else 0 end
    from (select distinct zkey, next_uci from public.game_positions
          where game_id = old_id and next_uci is not null) p
    where s.database_id = p_database_id and s.zkey = p.zkey and s.next_uci = p.next_uci;

    delete from public.position_stats s using public.game_positions p
    where p.game_id = old_id and s.database_id = p_database_id
      and s.zkey = p.zkey and s.next_uci = p.next_uci and s.games = 0;

    if p_operation = 'delete' then
      delete from public.games where id = old_id;
      update public.game_databases set game_count = greatest(0, game_count - 1) where id = p_database_id;
      return;
    end if;
    delete from public.game_positions where game_id = old_id;
  else
    raise exception using errcode = '22023', message = 'Invalid database game operation';
  end if;

  game_row := pg_catalog.jsonb_populate_record(null::public.games, p_game);
  if p_operation = 'insert' then
    old_id := p_game_id;
    insert into public.games
      (id, database_id, white, black, white_elo, black_elo, event, date, eco, opening, result, ply_count, pgn)
    values
      (old_id, p_database_id, game_row.white, game_row.black, game_row.white_elo, game_row.black_elo,
       game_row.event, game_row.date, game_row.eco, game_row.opening, game_row.result, game_row.ply_count, game_row.pgn);
    update public.game_databases set game_count = game_count + 1 where id = p_database_id;
  else
    update public.games set
      white = game_row.white, black = game_row.black, white_elo = game_row.white_elo,
      black_elo = game_row.black_elo, event = game_row.event, date = game_row.date,
      eco = game_row.eco, opening = game_row.opening, result = game_row.result,
      ply_count = game_row.ply_count, pgn = game_row.pgn
    where id = old_id;
  end if;

  insert into public.game_positions (game_id, seq, ply, zkey, next_uci)
  select old_id, p.seq, p.ply, p.zkey, p.next_uci
  from pg_catalog.jsonb_to_recordset(p_positions) as p(seq integer, ply integer, zkey bigint, next_uci text);

  insert into public.position_stats as s (database_id, zkey, next_uci, games, white_wins, draws, black_wins)
  select distinct p_database_id, p.zkey, p.next_uci, 1,
    case when game_row.result = '1-0' then 1 else 0 end,
    case when coalesce(game_row.result, '*') not in ('1-0', '0-1') then 1 else 0 end,
    case when game_row.result = '0-1' then 1 else 0 end
  from public.game_positions p where p.game_id = old_id and p.next_uci is not null
  on conflict (database_id, zkey, next_uci) do update set
    games = s.games + excluded.games,
    white_wins = s.white_wins + excluded.white_wins,
    draws = s.draws + excluded.draws,
    black_wins = s.black_wins + excluded.black_wins;
end;
$$;

revoke execute on function public.write_database_game(uuid, uuid, text, jsonb, jsonb, text, uuid[]) from public, anon;
grant execute on function public.write_database_game(uuid, uuid, text, jsonb, jsonb, text, uuid[]) to authenticated;
