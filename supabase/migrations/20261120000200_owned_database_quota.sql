-- SIG-1416: the limit applies to every owned database, regardless of kind.
create or replace function public.check_personal_database_quota()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owned integer;
begin
  if new.user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
    select count(*) into owned
      from public.game_databases
      where user_id = new.user_id and id <> new.id;
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
