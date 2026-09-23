-- Personal PGN databases in Files need insert/update/delete on games.

create policy "games_insert_own" on public.games
  for insert with check (
    exists (
      select 1 from public.game_databases d
      where d.id = games.database_id
        and d.user_id = auth.uid()
    )
  );

create policy "games_update_own" on public.games
  for update using (
    exists (
      select 1 from public.game_databases d
      where d.id = games.database_id
        and d.user_id = auth.uid()
    )
  );

create policy "games_delete_own" on public.games
  for delete using (
    exists (
      select 1 from public.game_databases d
      where d.id = games.database_id
        and d.user_id = auth.uid()
    )
  );
