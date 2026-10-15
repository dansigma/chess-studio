-- SIG-962: site global language. Remote column for user_settings.locale
-- so the en|pt-br site language syncs across devices. No CHECK constraint:
-- validation lives in app-level isSiteLocale guard (isBoardTheme precedent).
alter table public.user_settings
  add column if not exists locale text not null default 'en';
