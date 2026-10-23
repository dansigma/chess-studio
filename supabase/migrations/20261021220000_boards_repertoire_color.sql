-- SIG-1092: mark one board per user as the White/Black repertoire.
-- Nullable so ordinary boards carry no mark; the partial unique index keeps
-- at most one board per (user, color) while leaving unmarked rows alone.
-- Own-row RLS policies already cover the new column (no policy change).

alter table public.boards
  add column if not exists repertoire_color text
  check (repertoire_color in ('white', 'black'));

create unique index if not exists boards_user_repertoire_color_uq
  on public.boards (user_id, repertoire_color)
  where repertoire_color is not null;
