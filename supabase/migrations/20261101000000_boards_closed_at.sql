-- SIG-1199: closing a board in the Studio must survive a reload. Board rows
-- hold the user's PGN (analysis, repertoire mark) and are the only copy, so
-- closing never deletes the row; it stamps closed_at and the boot merge skips
-- stamped rows that are not open in this browser's session. Routine saves do
-- not write the column, so they keep working before the migration is applied. Own-row RLS policies already cover the new column.

alter table public.boards
  add column if not exists closed_at timestamptz;
