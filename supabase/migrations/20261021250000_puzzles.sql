-- SIG-1042: curated Lichess puzzle subset (slice 1/3, data side only).
-- Public read-only table fed offline by scripts/lichess-puzzles/build-subset.mjs
-- via \copy; clients only read (serving lands in SIG-1102).
create table if not exists public.puzzles (
  id text primary key,
  fen text not null,
  moves text[] not null check (cardinality(moves) % 2 = 1),
  rating int not null,
  themes text[] not null,
  popularity int,
  nb_plays int
);
create index if not exists puzzles_rating_idx
  on public.puzzles (rating);
create index if not exists puzzles_themes_idx
  on public.puzzles using gin (themes);
alter table public.puzzles enable row level security;
create policy "puzzles_select" on public.puzzles
  for select to anon, authenticated
  using (true);
grant select on public.puzzles to anon, authenticated;
