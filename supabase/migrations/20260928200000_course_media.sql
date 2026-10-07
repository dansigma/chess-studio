alter table public.courses
  add column if not exists cover_url text,
  add column if not exists video_url text;

alter table public.courses
  drop constraint if exists courses_cover_url_https;

alter table public.courses
  drop constraint if exists courses_video_url_https;

alter table public.courses
  add constraint courses_cover_url_https
  check (cover_url is null or (char_length(cover_url) between 8 and 2000 and cover_url like 'https://%'));

alter table public.courses
  add constraint courses_video_url_https
  check (video_url is null or (char_length(video_url) between 8 and 2000 and video_url like 'https://%'));
