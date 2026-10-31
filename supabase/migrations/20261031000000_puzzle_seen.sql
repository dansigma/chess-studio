-- SIG-1179: per-user puzzle seen ledger (regular pool only; daily + mistakes excluded by callers).
-- Insert-only ledger: one row per (user, puzzle). Selection excludes these ids
-- server-side via puzzles_unseen so large histories never ship to the client.
-- "Seen" = attempted (solved, failed, or gave up), recorded once at commit time;
-- merely displayed-but-unattempted puzzles are not recorded.
create table if not exists public.puzzle_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  puzzle_id text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, puzzle_id)
);
create index if not exists puzzle_seen_user_idx
  on public.puzzle_seen (user_id);
alter table public.puzzle_seen enable row level security;
create policy "puzzle_seen_select_own" on public.puzzle_seen
  for select using ((select auth.uid()) = user_id);
create policy "puzzle_seen_insert_own" on public.puzzle_seen
  for insert with check ((select auth.uid()) = user_id);
grant select, insert on public.puzzle_seen to authenticated;

-- SIG-1179: seed-stable unseen sampling over public.puzzles for signed-in users.
-- Mirrors puzzles_window (security invoker so the caller's table RLS applies)
-- plus an anti-join against the caller's own seen ledger. Anonymous callers
-- have no uid; they pass their local seen ids via p_exclude instead.
create or replace function public.puzzles_unseen(
  p_min int,
  p_max int,
  p_theme text,
  p_limit int,
  p_seed bigint,
  p_exclude text[]
)
returns setof public.puzzles
language sql
security invoker
set search_path = ''
as $$
  select * from public.puzzles
  where (p_min is null or rating >= p_min)
    and (p_max is null or rating <= p_max)
    and (p_theme is null or themes @> array[p_theme])
    and (p_exclude is null or not (id = any (p_exclude)))
    and not exists (
      select 1 from public.puzzle_seen s
      where s.user_id = (select auth.uid())
        and s.puzzle_id = puzzles.id
    )
  order by md5(id || coalesce(p_seed, 0)::text)
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
grant execute on function public.puzzles_unseen(int, int, text, int, bigint, text[])
  to authenticated;
-- Supabase/Postgres grants EXECUTE to PUBLIC by default: an explicit grant
-- to authenticated alone still leaves PUBLIC|EXECUTE and anon|EXECUTE, so
-- anon callers could invoke the RPC. Revoke both, keeping authenticated.
revoke execute on function public.puzzles_unseen(int, int, text, int, bigint, text[])
  from public, anon;
