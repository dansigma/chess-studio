-- SIG-1316: user-saved Studio dock layouts. `user_settings.layout` keeps the
-- current arrangement; `layouts` holds the named list (max 20, ~dock
-- snapshots each), mirrored from localStorage for signed-in users.
alter table public.user_settings
  add column if not exists layouts jsonb;

alter table public.user_settings
  add constraint user_settings_layouts_size check (pg_column_size(layouts) < 1048576) not valid;
alter table public.user_settings validate constraint user_settings_layouts_size;
