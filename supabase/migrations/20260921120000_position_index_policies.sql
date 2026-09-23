-- Signed-in users can index their own personal databases into game_positions and position_stats.

create policy "game_positions_insert_own" on public.game_positions
  for insert with check (
    exists (
      select 1
      from public.games g
      join public.game_databases d on d.id = g.database_id
      where g.id = game_positions.game_id
        and d.user_id = auth.uid()
    )
  );

create policy "game_positions_delete_own" on public.game_positions
  for delete using (
    exists (
      select 1
      from public.games g
      join public.game_databases d on d.id = g.database_id
      where g.id = game_positions.game_id
        and d.user_id = auth.uid()
    )
  );

create policy "position_stats_insert_own" on public.position_stats
  for insert with check (
    exists (
      select 1 from public.game_databases d
      where d.id = position_stats.database_id
        and d.user_id = auth.uid()
    )
  );

create policy "position_stats_update_own" on public.position_stats
  for update using (
    exists (
      select 1 from public.game_databases d
      where d.id = position_stats.database_id
        and d.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.game_databases d
      where d.id = position_stats.database_id
        and d.user_id = auth.uid()
    )
  );

create policy "position_stats_delete_own" on public.position_stats
  for delete using (
    exists (
      select 1 from public.game_databases d
      where d.id = position_stats.database_id
        and d.user_id = auth.uid()
    )
  );
