-- SIG-839: lock down public writes on explorer_cache.
-- Clients keep read access; inserts/updates happen only via the service role
-- (route /api/explorer), which bypasses RLS.

drop policy if exists "explorer_cache_insert" on public.explorer_cache;
drop policy if exists "explorer_cache_update" on public.explorer_cache;
drop policy if exists "explorer_cache_select" on public.explorer_cache;

create policy "explorer_cache_select" on public.explorer_cache
  for select to anon, authenticated
  using (true);
