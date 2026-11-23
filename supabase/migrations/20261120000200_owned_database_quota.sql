-- SIG-1416: the limit applies to every owned database, regardless of kind.
create or replace function public.check_personal_database_quota()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owned integer;
  previous_lock bigint;
  current_lock bigint;
begin
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    previous_lock := pg_catalog.hashtextextended(old.user_id::text, 0);
  end if;
  current_lock := pg_catalog.hashtextextended(new.user_id::text, 0);
  if previous_lock is not null and current_lock is not null then
    perform pg_catalog.pg_advisory_xact_lock(least(previous_lock, current_lock));
    perform pg_catalog.pg_advisory_xact_lock(greatest(previous_lock, current_lock));
  elsif previous_lock is not null then
    perform pg_catalog.pg_advisory_xact_lock(previous_lock);
  elsif current_lock is not null then
    perform pg_catalog.pg_advisory_xact_lock(current_lock);
  end if;

  if new.user_id is not null then
    if tg_op = 'INSERT' then
      select count(*) into owned
        from public.game_databases
        where user_id = new.user_id;
    else
      select count(*) into owned
        from public.game_databases
        where user_id = new.user_id and id <> new.id;
    end if;
    if owned >= 10 then
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
  before insert or update of kind, user_id on public.game_databases
  for each row execute function public.check_personal_database_quota();
