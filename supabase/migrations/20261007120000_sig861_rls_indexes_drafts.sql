-- SIG-861: complete RLS, indexes, and course drafts.
--
-- Section A: rewrite every auth-uid check as (select auth.uid()) so the
-- function is evaluated once per statement (init-plan) instead of once per
-- row. No policy widens: each drop/create pair preserves the old name,
-- target roles, and predicate shape.
-- Section B: symmetric own-row DELETEs (settings, course_progress) plus the
-- missing game_positions UPDATE, mirroring position_stats_update_own.
-- Section C: courses.published_at column (created before the index and policies
-- that reference it).
-- Section D: indexes for courses.created_by, the published catalog read,
-- and trigram search over games(white, black).
-- Section E: courses draft policies via published_at (null = draft, invisible
-- to anon; the column is backfilled from updated_at so every existing course
-- stays visible).
--
-- Writes on courses stay service-role-only (publish.ts gate): no
-- insert/update/delete policies are added for anon/authenticated.

-- ============ Section A: init-plan rewrites ============

-- boards
drop policy if exists "boards_select_own" on public.boards;
create policy "boards_select_own" on public.boards
  for select using ((select auth.uid()) = user_id);
drop policy if exists "boards_insert_own" on public.boards;
create policy "boards_insert_own" on public.boards
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "boards_update_own" on public.boards;
create policy "boards_update_own" on public.boards
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "boards_delete_own" on public.boards;
create policy "boards_delete_own" on public.boards
  for delete using ((select auth.uid()) = user_id);

-- user_settings
drop policy if exists "settings_select_own" on public.user_settings;
create policy "settings_select_own" on public.user_settings
  for select using ((select auth.uid()) = user_id);
drop policy if exists "settings_insert_own" on public.user_settings;
create policy "settings_insert_own" on public.user_settings
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "settings_update_own" on public.user_settings;
create policy "settings_update_own" on public.user_settings
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- game_databases
drop policy if exists "game_databases_select" on public.game_databases;
create policy "game_databases_select" on public.game_databases
  for select using (user_id is null or user_id = (select auth.uid()));
drop policy if exists "game_databases_insert_own" on public.game_databases;
create policy "game_databases_insert_own" on public.game_databases
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "game_databases_update_own" on public.game_databases;
create policy "game_databases_update_own" on public.game_databases
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "game_databases_delete_own" on public.game_databases;
create policy "game_databases_delete_own" on public.game_databases
  for delete using ((select auth.uid()) = user_id);

-- games
drop policy if exists "games_select" on public.games;
create policy "games_select" on public.games
  for select using (
    exists (
      select 1 from public.game_databases d
      where d.id = games.database_id
        and (d.user_id is null or d.user_id = (select auth.uid()))
    )
  );
drop policy if exists "games_insert_own" on public.games;
create policy "games_insert_own" on public.games
  for insert with check (
    exists (
      select 1 from public.game_databases d
      where d.id = games.database_id
        and d.user_id = (select auth.uid())
    )
  );
drop policy if exists "games_update_own" on public.games;
create policy "games_update_own" on public.games
  for update using (
    exists (
      select 1 from public.game_databases d
      where d.id = games.database_id
        and d.user_id = (select auth.uid())
    )
  );
drop policy if exists "games_delete_own" on public.games;
create policy "games_delete_own" on public.games
  for delete using (
    exists (
      select 1 from public.game_databases d
      where d.id = games.database_id
        and d.user_id = (select auth.uid())
    )
  );

-- game_positions
drop policy if exists "game_positions_select" on public.game_positions;
create policy "game_positions_select" on public.game_positions
  for select using (
    exists (
      select 1
      from public.games g
      join public.game_databases d on d.id = g.database_id
      where g.id = game_positions.game_id
        and (d.user_id is null or d.user_id = (select auth.uid()))
    )
  );
drop policy if exists "game_positions_insert_own" on public.game_positions;
create policy "game_positions_insert_own" on public.game_positions
  for insert with check (
    exists (
      select 1
      from public.games g
      join public.game_databases d on d.id = g.database_id
      where g.id = game_positions.game_id
        and d.user_id = (select auth.uid())
    )
  );
drop policy if exists "game_positions_delete_own" on public.game_positions;
create policy "game_positions_delete_own" on public.game_positions
  for delete using (
    exists (
      select 1
      from public.games g
      join public.game_databases d on d.id = g.database_id
      where g.id = game_positions.game_id
        and d.user_id = (select auth.uid())
    )
  );

-- position_stats
drop policy if exists "position_stats_select" on public.position_stats;
create policy "position_stats_select" on public.position_stats
  for select using (
    exists (
      select 1 from public.game_databases d
      where d.id = position_stats.database_id
        and (d.user_id is null or d.user_id = (select auth.uid()))
    )
  );
drop policy if exists "position_stats_insert_own" on public.position_stats;
create policy "position_stats_insert_own" on public.position_stats
  for insert with check (
    exists (
      select 1 from public.game_databases d
      where d.id = position_stats.database_id
        and d.user_id = (select auth.uid())
    )
  );
drop policy if exists "position_stats_update_own" on public.position_stats;
create policy "position_stats_update_own" on public.position_stats
  for update using (
    exists (
      select 1 from public.game_databases d
      where d.id = position_stats.database_id
        and d.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.game_databases d
      where d.id = position_stats.database_id
        and d.user_id = (select auth.uid())
    )
  );
drop policy if exists "position_stats_delete_own" on public.position_stats;
create policy "position_stats_delete_own" on public.position_stats
  for delete using (
    exists (
      select 1 from public.game_databases d
      where d.id = position_stats.database_id
        and d.user_id = (select auth.uid())
    )
  );

-- player_bookmarks
drop policy if exists "player_bookmarks_select_own" on public.player_bookmarks;
create policy "player_bookmarks_select_own" on public.player_bookmarks
  for select using ((select auth.uid()) = user_id);
drop policy if exists "player_bookmarks_insert_own" on public.player_bookmarks;
create policy "player_bookmarks_insert_own" on public.player_bookmarks
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "player_bookmarks_update_own" on public.player_bookmarks;
create policy "player_bookmarks_update_own" on public.player_bookmarks
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "player_bookmarks_delete_own" on public.player_bookmarks;
create policy "player_bookmarks_delete_own" on public.player_bookmarks
  for delete using ((select auth.uid()) = user_id);

-- course_progress
drop policy if exists "course_progress_select_own" on public.course_progress;
create policy "course_progress_select_own" on public.course_progress
  for select using ((select auth.uid()) = user_id);
drop policy if exists "course_progress_insert_own" on public.course_progress;
create policy "course_progress_insert_own" on public.course_progress
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "course_progress_update_own" on public.course_progress;
create policy "course_progress_update_own" on public.course_progress
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- explorer_cache stays as SIG-839 left it (select-only, no auth call to
-- wrap) and course_admins stays deny-all; courses policies are replaced in
-- Section D below.

-- ============ Section B: DELETE/UPDATE symmetry ============

-- user_settings had select/insert/update but no delete: users could never
-- remove their own settings row (account cleanup stayed service-role-only
-- by accident, not by decision).
drop policy if exists "settings_delete_own" on public.user_settings;
create policy "settings_delete_own" on public.user_settings
  for delete using ((select auth.uid()) = user_id);
grant delete on public.user_settings to authenticated;

-- course_progress had select/insert/update but no delete: students could
-- never reset their own progress.
drop policy if exists "course_progress_delete_own" on public.course_progress;
create policy "course_progress_delete_own" on public.course_progress
  for delete using ((select auth.uid()) = user_id);
grant delete on public.course_progress to authenticated;

-- game_positions had insert/delete but no update, while its sibling
-- position_stats has position_stats_update_own. Symmetric own-db UPDATE so
-- future corrections don't require a full delete+reindex.
drop policy if exists "game_positions_update_own" on public.game_positions;
create policy "game_positions_update_own" on public.game_positions
  for update using (
    exists (
      select 1
      from public.games g
      join public.game_databases d on d.id = g.database_id
      where g.id = game_positions.game_id
        and d.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.games g
      join public.game_databases d on d.id = g.database_id
      where g.id = game_positions.game_id
        and d.user_id = (select auth.uid())
    )
  );

-- ============ Section C: published_at column ============

-- Must run before Section D's partial index and Section E's policies, which reference
-- published_at — the original order (index before column) failed on fresh applies
-- with 42703: column "published_at" does not exist.

alter table public.courses add column if not exists published_at timestamptz;

-- Every existing course stays visible: backfill from updated_at.
update public.courses set published_at = updated_at where published_at is null;

alter table public.courses alter column published_at set default now();

-- ============ Section D: indexes ============

create extension if not exists pg_trgm;

-- Ownership lookups on courses (publisher gate point-reads, owner draft
-- preview) had no index.
create index if not exists courses_created_by_idx
  on public.courses (created_by);

-- Catalog read: order by updated_at over published rows only.
create index if not exists courses_published_updated_idx
  on public.courses (updated_at desc) where published_at is not null;

-- Player search filters white/black with leading-wildcard ilike
-- (players-server.ts searchStudioDatabase/studioGames): btree can't help,
-- trigram GIN can.
create index if not exists games_white_trgm_idx
  on public.games using gin (white gin_trgm_ops);
create index if not exists games_black_trgm_idx
  on public.games using gin (black gin_trgm_ops);

-- ============ Section E: courses draft policies ============

-- Replace the select-all policy: anon/authenticated see published rows;
-- publishers preview their own drafts.
drop policy if exists "courses_select_all" on public.courses;
create policy "courses_select_published" on public.courses
  for select to anon, authenticated
  using (published_at is not null);
drop policy if exists "courses_select_own_drafts" on public.courses;
create policy "courses_select_own_drafts" on public.courses
  for select to authenticated
  using (created_by = (select auth.uid()));

-- Grants unchanged: grant select on public.courses to anon, authenticated
-- (policies filter, grants permit). No insert/update/delete policies for
-- anon/authenticated: writes stay service-role-only via the publisher gate.
