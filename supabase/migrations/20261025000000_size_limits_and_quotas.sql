-- SIG-1082: size limits and per-user quotas for boards, games, layouts and databases.
--
-- Unbounded user-controlled writes let one account fill shared storage: games.pgn,
-- boards.pgn and user_settings.layout had no size checks, and there was no cap on
-- the number of personal databases or games per database. This migration enforces
-- the limits at the trust boundary:
--
-- * games.pgn <= 1 MB (octet_length, byte-exact for multibyte PGN text)
-- * boards.pgn <= 2 MB
-- * user_settings.layout < 256 KB (pg_column_size, matching the puzzle_progress
--   precedent in 20261005120000_puzzle_progress.sql)
-- * at most 50 personal databases per user (quota_databases trigger)
-- * at most 5,000 games per database (quota_games guard in swap_database_games)
--
-- Client contract: quota rejections raise with message 'quota_databases' /
-- 'quota_games' (errcode P0001); size rejections surface as check-violation 23514
-- naming the constraint below. src/lib/user-files.ts maps both to user-facing text.

alter table public.games
  add constraint games_pgn_size check (octet_length(pgn) <= 1000000) not valid;
alter table public.games validate constraint games_pgn_size;

alter table public.boards
  add constraint boards_pgn_size check (octet_length(pgn) <= 2000000) not valid;
alter table public.boards validate constraint boards_pgn_size;

alter table public.user_settings
  add constraint user_settings_layout_size check (pg_column_size(layout) < 262144) not valid;
alter table public.user_settings validate constraint user_settings_layout_size;

create or replace function public.check_personal_database_quota()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owned integer;
begin
  if new.kind = 'personal' then
    select count(*) into owned
      from public.game_databases
      where user_id = new.user_id and kind = 'personal';
    if owned >= 50 then
      raise exception using
        errcode = 'P0001',
        message = 'quota_databases';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists game_databases_personal_quota on public.game_databases;
create trigger game_databases_personal_quota
  before insert on public.game_databases
  for each row execute function public.check_personal_database_quota();

create or replace function public.swap_database_games(p_database_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  pending_count integer;
  promoted integer;
begin
  select count(*) into pending_count
    from public.games
    where database_id = p_database_id and pending = true;
  if pending_count > 5000 then
    raise exception using
      errcode = 'P0001',
      message = 'quota_games';
  end if;
  delete from public.games where database_id = p_database_id and pending = false;
  update public.games set pending = false where database_id = p_database_id and pending = true;
  get diagnostics promoted = row_count;
  return promoted;
end;
$$;

grant execute on function public.swap_database_games(uuid) to authenticated;
