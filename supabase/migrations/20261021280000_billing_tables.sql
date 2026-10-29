-- SIG-1051: subscription, course purchase and payment-event tables.
--
-- Users read their own rows; only the server (service role, from verified
-- payment webhooks) writes. Money is integer cents of BRL. A user holds at
-- most one paid purchase per course (partial unique index).
--
-- Conventions: own-row read pattern with service-role-only writes follows
-- repertoire_progress (20261013120000_repertoire_progress.sql); the deny-all
-- pattern follows course_admins (20260928210000_profiles_and_admins.sql:25-32).

-- ============ subscriptions ============

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  provider_customer_id text,
  provider_subscription_id text not null,
  plan text not null check (plan in ('premium_monthly', 'premium_yearly')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies: writes go through the service role only.

grant select on public.subscriptions to authenticated;

create unique index if not exists subscriptions_provider_subscription_uidx
  on public.subscriptions (provider, provider_subscription_id);

create index if not exists subscriptions_user_status_idx
  on public.subscriptions (user_id, status);

-- ============ course_purchases ============

create table if not exists public.course_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  provider text not null,
  provider_payment_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL',
  status text not null check (status in ('pending', 'paid', 'refunded', 'chargeback')),
  purchased_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.course_purchases enable row level security;

drop policy if exists "course_purchases_select_own" on public.course_purchases;
create policy "course_purchases_select_own" on public.course_purchases
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies: writes go through the service role only.

grant select on public.course_purchases to authenticated;

create unique index if not exists course_purchases_provider_payment_uidx
  on public.course_purchases (provider, provider_payment_id);

-- A user holds at most one paid purchase per course.
create unique index if not exists course_purchases_user_course_paid_uidx
  on public.course_purchases (user_id, course_id) where status = 'paid';

-- ============ payment_events ============

-- Webhook idempotency log. Stores no card or personal data.
create table if not exists public.payment_events (
  provider text not null,
  event_id text not null,
  kind text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);

alter table public.payment_events enable row level security;

revoke all on table public.payment_events from anon, authenticated;

drop policy if exists "payment_events_no_client_access" on public.payment_events;
create policy "payment_events_no_client_access" on public.payment_events
  for select to authenticated
  using (false);
