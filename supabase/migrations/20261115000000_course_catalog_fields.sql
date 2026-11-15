-- SIG-1349: catalog fit fields on courses (level, Elo range, language,
-- duration). Existing rows default to beginner / pt-br with no Elo range
-- and no duration.

alter table public.courses
  add column if not exists level text not null default 'beginner',
  add column if not exists elo_min integer,
  add column if not exists elo_max integer,
  add column if not exists language text not null default 'pt-br',
  add column if not exists duration_minutes integer;

alter table public.courses drop constraint if exists courses_level_check;
alter table public.courses
  add constraint courses_level_check
  check (level in ('beginner', 'intermediate', 'advanced'));

alter table public.courses drop constraint if exists courses_language_check;
alter table public.courses
  add constraint courses_language_check
  check (language in ('pt-br', 'en'));

alter table public.courses drop constraint if exists courses_elo_range_check;
alter table public.courses
  add constraint courses_elo_range_check
  check (
    (elo_min is null and elo_max is null)
    or (
      elo_min is not null and elo_max is not null
      and elo_min between 0 and 3500
      and elo_max between 0 and 3500
      and elo_min <= elo_max
    )
  );

alter table public.courses drop constraint if exists courses_duration_minutes_check;
alter table public.courses
  add constraint courses_duration_minutes_check
  check (duration_minutes is null or duration_minutes between 1 and 20000);

-- Column-level select grants (chapters stays hidden): new columns are
-- invisible to anon/authenticated until granted.
grant select (level, elo_min, elo_max, language, duration_minutes)
  on public.courses to anon, authenticated;
