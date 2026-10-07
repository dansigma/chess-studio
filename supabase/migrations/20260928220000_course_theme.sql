alter table public.courses
  add column if not exists theme text not null default 'openings';

alter table public.courses
  drop constraint if exists courses_theme_check;

alter table public.courses
  add constraint courses_theme_check
  check (theme in ('openings', 'strategy', 'tactics', 'endgames'));
