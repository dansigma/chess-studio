-- SIG-1102: seed-stable puzzle sampling over public.puzzles (slice 2/3, serving).
-- The table itself (RLS select-only for anon, authenticated) comes from SIG-1042;
-- this function is security invoker so the caller's table RLS applies.
-- p_limit is clamped to 1-200; callers needing more stay on the catalog fallback.
create or replace function public.puzzles_window(
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
  order by md5(id || coalesce(p_seed, 0)::text)
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
grant execute on function public.puzzles_window(int, int, text, int, bigint, text[])
  to anon, authenticated;
