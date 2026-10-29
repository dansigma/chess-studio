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
