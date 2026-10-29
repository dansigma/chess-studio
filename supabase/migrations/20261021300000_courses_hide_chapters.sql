-- SIG-1120: revoke public read access to courses.chapters.
--
-- After SIG-1119 no public/session-client code reads courses.chapters
-- (the catalog, course and lesson pages read the content-free outline;
-- lesson content comes from course_content through can_access_course), but
-- the table-level grant still exposes every column to anyone holding the
-- public key. This migration replaces the table-level SELECT grant with
-- column-level grants covering every current column except chapters.
--
-- Deploy only after the SIG-1119 application release is live and verified
-- in production: the old code selecting chapters would fail with
-- permission denied on this migration. Writes keep going through the
-- service role, which column grants do not affect.
--
-- Production rollout (executable, in order):
-- 1. Merge and deploy the gate + app from this PR (migrations
--    20261021280000, 20261021290000 and the outline/locked-lesson client).
-- 2. Confirm in production: course catalog renders, a free lesson loads
--    full content, a paid lesson shows the locked CTA for an anonymous
--    visitor, and supabase migration list --linked shows 20261021290000
--    applied with no pending migrations before it.
-- 3. Apply this migration:
--      supabase db push --linked
--    (or execute this file in the SQL editor), then re-run step 2 plus:
--      select grantee, privilege_type, is_grantable from
--        information_schema.role_table_grants
--      where table_schema = 'public' and table_name = 'courses'
--      order by grantee;
--    Expected: anon/authenticated hold SELECT on every column except
--    chapters (one row per column, none for chapters).
-- 4. If step 3 breaks lesson reads, roll back by re-granting first
--    (keeps the gate intact while the app is fixed):
--      grant select on public.courses to anon, authenticated;
--    then re-apply this migration once the fixed client is live.
--
-- Column inventory (verified at write time, in migration order):
-- base (20260928170000): id, slug, title, summary, color, chapters,
--   created_by, updated_at
-- 20260928200000_course_media: cover_url, video_url
-- 20260928220000_course_theme: theme
-- 20261007120000_sig861_rls_indexes_drafts: published_at
-- 20261021270000_course_status_and_tier: status, review_note, access_tier,
--   price_cents, currency, author_display_name
-- 20261021290000_course_content_gate: outline

revoke select on public.courses from anon, authenticated;

grant select (
  id, slug, title, summary, color, theme, cover_url, video_url,
  published_at, status, review_note, access_tier, price_cents, currency,
  author_display_name, outline, created_by, updated_at
) on public.courses to anon, authenticated;

-- Row policies are unchanged: courses_select_published (anon/authenticated
-- see published rows) and courses_select_own_drafts still filter rows;
-- only the column grants changed. No insert/update/delete policies exist
-- for anon/authenticated: writes stay service-role-only.
