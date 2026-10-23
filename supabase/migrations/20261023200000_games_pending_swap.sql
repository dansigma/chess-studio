-- SIG-1037: atomic re-save of personal databases (insert pending, then swap).
--
-- Re-saving a personal database used to update game_count, delete every game,
-- then insert the new set in one call — if the insert failed the database was
-- left empty while claiming to have games, and the error was swallowed.
-- New flow: clients insert the new games with pending = true (chunked), and
-- swap_database_games() promotes them in a single transaction (delete the old
-- non-pending games, flip pending to false, return the promoted count).
-- Readers filter pending = false so half-saved data is never listed.

alter table public.games add column if not exists pending boolean not null default false;

create index if not exists games_database_pending_idx on public.games (database_id) where pending;

create or replace function public.swap_database_games(p_database_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  promoted integer;
begin
  delete from public.games where database_id = p_database_id and pending = false;
  update public.games set pending = false where database_id = p_database_id and pending = true;
  get diagnostics promoted = row_count;
  return promoted;
end;
$$;

grant execute on function public.swap_database_games(uuid) to authenticated;
