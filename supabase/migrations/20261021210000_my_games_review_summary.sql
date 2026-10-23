-- SIG-1090: batch review summaries (My Games 4/5). Per-game background
-- review results written back to the imported row: the user's accuracy, the
-- opponent's accuracy, when the review finished, and the user's mistake
-- counts per phase. The sync route (SIG-1088) never writes these; only the
-- batch-review client write-back does, so the update surface is limited to
-- exactly these four columns via the column grant below (policy alone would
-- allow updating any column).
alter table public.my_games
  add column if not exists user_accuracy real,
  add column if not exists opponent_accuracy real,
  add column if not exists reviewed_at timestamptz,
  add column if not exists mistake_counts jsonb;
-- Fixed 3-phases x 4-tiers integer shape; the payload is under 200 bytes in
-- practice, the 2 KB cap only guards against a buggy client.
alter table public.my_games
  add constraint my_games_mistake_counts_size check (
    mistake_counts is null or pg_column_size(mistake_counts) < 2048
  );
create policy "my_games_update_review_own" on public.my_games
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant update (user_accuracy, opponent_accuracy, reviewed_at, mistake_counts)
  on public.my_games to authenticated;
