-- SIG-1179: execute-privilege test for puzzles_unseen.
--
-- Run with: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
--   -v ON_ERROR_STOP=1 -f supabase/tests/puzzle_seen_grants.sql
-- Everything is rolled back at the end, so the test is side-effect free.
--
-- Postgres grants EXECUTE to PUBLIC on new functions by default. An explicit
-- `grant execute ... to authenticated` alone still leaves PUBLIC|EXECUTE and
-- anon|EXECUTE in place, so anon callers could invoke the RPC. The migration
-- must revoke execute from public, anon and keep authenticated.
--
-- Requires: 20261031000000_puzzle_seen.sql.

begin;

do $$
declare
  v_grantees text;
begin
  -- Only authenticated may execute among client-facing roles: no PUBLIC /
  -- anon privilege on the function. (The function owner and service_role
  -- always appear in routine_privileges; they are not client callers.)
  select coalesce(string_agg(grantee::text, ',' order by grantee::text), '')
    into v_grantees
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name = 'puzzles_unseen'
    and privilege_type = 'EXECUTE'
    and grantee in ('PUBLIC', 'anon', 'authenticated');
  if v_grantees <> 'authenticated' then
    raise exception 'puzzles_unseen EXECUTE grantees must be exactly authenticated, got: %', v_grantees;
  end if;
  raise notice 'puzzles_unseen execute restricted to authenticated ok';
end;
$$;

rollback;
