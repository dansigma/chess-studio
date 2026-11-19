-- SIG-1416: raise the game limit and cap new personal databases at ten.
create or replace function public.max_games_per_database()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select 25000;
$$;

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
    -- Serialize concurrent inserts for the same owner before counting.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
    select count(*) into owned
      from public.game_databases
      where user_id = new.user_id and kind = 'personal';
    if owned >= 10 then
      raise exception using
        errcode = 'P0001',
        message = 'quota_databases';
    end if;
  end if;
  return new;
end;
$$;

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
  if pending_count > public.max_games_per_database() then
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
