-- SIG-1050: course review workflow (status) and access tier columns.
--
-- * status is the source of truth for visibility: draft → in_review →
--   published | rejected, plus archived. published_at stays as the
--   publication timestamp, kept consistent by courses_sync_published_at.
-- * access_tier (free | premium | paid) with price_cents required exactly
--   when paid; currency is BRL-only for now.
-- * Client writes to courses stay closed (all writes go through the service
--   role in server actions); only the public select policy predicate changes.
-- * No visible change by design: every row with published_at set becomes
--   published/free, drafts become draft/free.

-- ============ Section A: status column + backfill ============

alter table public.courses add column if not exists status text not null default 'draft';

alter table public.courses drop constraint if exists courses_status_check;
alter table public.courses
  add constraint courses_status_check check (status in ('draft', 'in_review', 'published', 'rejected', 'archived'));

-- Every existing published course stays visible: backfill from published_at.
-- Rows with null published_at keep the 'draft' default.
update public.courses set status = 'published' where published_at is not null;

-- A row inserted without the column was auto-published (default now());
-- status is the source of truth now, so drop the default.
alter table public.courses alter column published_at drop default;

-- ============ Section B: review note + access tier columns ============

alter table public.courses add column if not exists review_note text;

alter table public.courses drop constraint if exists courses_review_note_check;
alter table public.courses
  add constraint courses_review_note_check check (review_note is null or char_length(review_note) <= 500);

alter table public.courses add column if not exists access_tier text not null default 'free';

alter table public.courses drop constraint if exists courses_access_tier_check;
alter table public.courses
  add constraint courses_access_tier_check check (access_tier in ('free', 'premium', 'paid'));

alter table public.courses add column if not exists price_cents integer;

alter table public.courses drop constraint if exists courses_price_cents_check;
alter table public.courses
  add constraint courses_price_cents_check check (price_cents is null or price_cents > 0);

-- A paid course must carry a price; a non-paid course must not.
alter table public.courses drop constraint if exists courses_paid_price_check;
alter table public.courses
  add constraint courses_paid_price_check check ((access_tier = 'paid') = (price_cents is not null));

alter table public.courses add column if not exists currency text not null default 'BRL';

alter table public.courses drop constraint if exists courses_currency_check;
alter table public.courses
  add constraint courses_currency_check check (currency = 'BRL');

alter table public.courses add column if not exists author_display_name text;

-- ============ Section C: published_at consistency trigger ============

-- Backstop for out-of-band SQL writes; the app writes status and
-- published_at explicitly. Security invoker (default), empty search_path.
create or replace function public.courses_sync_published_at()
returns trigger
language plpgsql
set search_path = '' as
$$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  elsif new.status <> 'published' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists courses_sync_published_at on public.courses;
create trigger courses_sync_published_at
  before insert or update of status, published_at on public.courses
  for each row execute function public.courses_sync_published_at();

-- ============ Section D: index ============

-- Catalog read: order by updated_at over published rows only.
drop index if exists public.courses_published_updated_idx;
create index if not exists courses_status_published_idx
  on public.courses (updated_at desc) where status = 'published';

-- ============ Section E: courses select policy ============

-- Replace the published_at predicate: anon/authenticated see published rows;
-- the own-drafts policy is untouched.
drop policy if exists "courses_select_published" on public.courses;
create policy "courses_select_published" on public.courses
  for select to anon, authenticated
  using (status = 'published');

-- Grants unchanged: grant select on public.courses to anon, authenticated
-- (policies filter, grants permit). No insert/update/delete policies for
-- anon/authenticated: writes stay service-role-only via the publisher gate.
