-- SIG-1052 (merged from SIG-1118): access-matrix test for can_access_course.
--
-- Run with: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
--   -v ON_ERROR_STOP=1 -f supabase/tests/can_access_course.sql
-- Everything is rolled back at the end, so the test is side-effect free.
-- Each positive case must return its row; each negative case must return
-- zero rows. A wrong result raises, failing the script loudly.

begin;

-- ---------- Fixtures ----------

-- Users: admin, owner, buyer, refunded buyer, subscriber, canceled-but-in-
-- period subscriber, expired subscriber, plain student. Anonymous needs no row.
-- Note: the on_auth_user_created trigger auto-inserts a student profile row,
-- so use upserts here (insert ... on conflict do update).
insert into auth.users (id)
values
  ('10000000-0000-0000-0000-000000000001'), -- admin
  ('10000000-0000-0000-0000-000000000002'), -- owner
  ('10000000-0000-0000-0000-000000000003'), -- buyer
  ('10000000-0000-0000-0000-000000000004'), -- refunded buyer
  ('10000000-0000-0000-0000-000000000005'), -- subscriber
  ('10000000-0000-0000-0000-000000000006'), -- canceled in period
  ('10000000-0000-0000-0000-000000000007'), -- expired subscriber
  ('10000000-0000-0000-0000-000000000008'); -- student

insert into public.profiles (id, role)
values
  ('10000000-0000-0000-0000-000000000001', 'admin'),
  ('10000000-0000-0000-0000-000000000002', 'coach'),
  ('10000000-0000-0000-0000-000000000003', 'student'),
  ('10000000-0000-0000-0000-000000000004', 'student'),
  ('10000000-0000-0000-0000-000000000005', 'student'),
  ('10000000-0000-0000-0000-000000000006', 'student'),
  ('10000000-0000-0000-0000-000000000007', 'student'),
  ('10000000-0000-0000-0000-000000000008', 'student')
on conflict (id) do update set role = excluded.role;

-- Courses: a free published course, a premium published course, a paid
-- published course (owned by the owner user), and a premium draft.
-- gate-orphan: a published paid course with created_by IS NULL — fail-closed
-- regression case: anon and plain students must see zero rows (the owner
-- clause must not match NULL/NULL).
insert into public.courses (id, slug, title, summary, color, theme, chapters, access_tier, price_cents, status, created_by)
values
  ('20000000-0000-0000-0000-000000000001', 'gate-free', 'Free', '', 'white', 'openings',
   '[{"id":"ch1","title":"Chapter","variations":[{"id":"v1","title":"Line","pgn":"1. e4 e5"}]}]',
   'free', null, 'published', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000002', 'gate-premium', 'Premium', '', 'white', 'openings',
   '[{"id":"ch1","title":"Chapter","variations":[{"id":"v1","title":"Line","pgn":"1. e4 e5"}]}]',
   'premium', null, 'published', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003', 'gate-paid', 'Paid', '', 'white', 'openings',
   '[{"id":"ch1","title":"Chapter","variations":[{"id":"v1","title":"Line","pgn":"1. e4 e5"}]}]',
   'paid', 1990, 'published', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000004', 'gate-draft', 'Draft', '', 'white', 'openings',
   '[{"id":"ch1","title":"Chapter","variations":[{"id":"v1","title":"Line","pgn":"1. e4 e5"}]}]',
   'premium', null, 'draft', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000005', 'gate-orphan', 'Orphan', '', 'white', 'openings',
   '[{"id":"ch1","title":"Chapter","variations":[{"id":"v1","title":"Line","pgn":"1. e4 e5"}]}]',
   'paid', 1990, 'published', null);

-- Subscriptions (premium plan).
insert into public.subscriptions (user_id, provider, provider_subscription_id, plan, status, current_period_end)
values
  ('10000000-0000-0000-0000-000000000005', 'test', 'sub-active', 'premium_monthly', 'active', now() + interval '20 days'),
  ('10000000-0000-0000-0000-000000000006', 'test', 'sub-canceled', 'premium_monthly', 'canceled', now() + interval '5 days'),
  ('10000000-0000-0000-0000-000000000007', 'test', 'sub-expired', 'premium_monthly', 'canceled', now() - interval '10 days');

-- Purchases: a live purchase of the paid course, and a refunded one.
insert into public.course_purchases (user_id, course_id, provider, provider_payment_id, amount_cents, status, purchased_at)
values
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'test', 'pay-live', 1990, 'paid', now()),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 'test', 'pay-refunded', 1990, 'refunded', now());

-- ---------- Helpers ----------

-- Run a body as a role with that user's JWT claims. Plain functions (not
-- procedures): set_config with is_local=true keeps the setting inside the
-- surrounding transaction, which the rollback then discards.
create or replace function pg_temp.as_role(role_name text, user_id text) returns void
language plpgsql as $$
begin
  execute format('set local role %I', role_name);
  if user_id is not null then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', user_id)::text, true);
  else
    perform set_config('request.jwt.claims', '{}', true);
  end if;
end;
$$;

create or replace function pg_temp.can_see(course_id uuid) returns boolean
language sql stable as $$
  select exists (select 1 from public.course_content where course_content.course_id = can_see.course_id);
$$;

do $$
declare
  free_id uuid := '20000000-0000-0000-0000-000000000001';
  premium_id uuid := '20000000-0000-0000-0000-000000000002';
  paid_id uuid := '20000000-0000-0000-0000-000000000003';
  draft_id uuid := '20000000-0000-0000-0000-000000000004';
  orphan_id uuid := '20000000-0000-0000-0000-000000000005';
  admin_id text := '10000000-0000-0000-0000-000000000001';
  owner_id text := '10000000-0000-0000-0000-000000000002';
  buyer_id text := '10000000-0000-0000-0000-000000000003';
  refunded_id text := '10000000-0000-0000-0000-000000000004';
  subscriber_id text := '10000000-0000-0000-0000-000000000005';
  canceled_id text := '10000000-0000-0000-0000-000000000006';
  expired_id text := '10000000-0000-0000-0000-000000000007';
  student_id text := '10000000-0000-0000-0000-000000000008';
begin
  -- Anonymous: free only.
  perform pg_temp.as_role('anon', null);
  if (select pg_temp.can_see(free_id)) is distinct from true then
    raise exception 'gate case failed: %', 'anon free';
  end if;
  raise notice 'gate case ok: %', 'anon free';
  if (select pg_temp.can_see(premium_id)) is distinct from false then
    raise exception 'gate case failed: %', 'anon premium';
  end if;
  raise notice 'gate case ok: %', 'anon premium';
  if (select pg_temp.can_see(paid_id)) is distinct from false then
    raise exception 'gate case failed: %', 'anon paid';
  end if;
  raise notice 'gate case ok: %', 'anon paid';
  if (select pg_temp.can_see(draft_id)) is distinct from false then
    raise exception 'gate case failed: %', 'anon draft';
  end if;
  raise notice 'gate case ok: %', 'anon draft';
  if (select pg_temp.can_see(orphan_id)) is distinct from false then
    raise exception 'gate case failed: %', 'anon orphan (NULL owner must grant nothing)';
  end if;
  raise notice 'gate case ok: %', 'anon orphan';

  -- Student: free only.
  perform pg_temp.as_role('authenticated', student_id);
  if (select pg_temp.can_see(free_id)) is distinct from true then
    raise exception 'gate case failed: %', 'student free';
  end if;
  raise notice 'gate case ok: %', 'student free';
  if (select pg_temp.can_see(premium_id)) is distinct from false then
    raise exception 'gate case failed: %', 'student premium';
  end if;
  raise notice 'gate case ok: %', 'student premium';
  if (select pg_temp.can_see(paid_id)) is distinct from false then
    raise exception 'gate case failed: %', 'student paid';
  end if;
  raise notice 'gate case ok: %', 'student paid';
  if (select pg_temp.can_see(draft_id)) is distinct from false then
    raise exception 'gate case failed: %', 'student draft';
  end if;
  raise notice 'gate case ok: %', 'student draft';
  if (select pg_temp.can_see(orphan_id)) is distinct from false then
    raise exception 'gate case failed: %', 'student orphan (NULL owner must grant nothing)';
  end if;
  raise notice 'gate case ok: %', 'student orphan';

  -- Subscriber: free + premium.
  perform pg_temp.as_role('authenticated', subscriber_id);
  if (select pg_temp.can_see(free_id)) is distinct from true then
    raise exception 'gate case failed: %', 'subscriber free';
  end if;
  raise notice 'gate case ok: %', 'subscriber free';
  if (select pg_temp.can_see(premium_id)) is distinct from true then
    raise exception 'gate case failed: %', 'subscriber premium';
  end if;
  raise notice 'gate case ok: %', 'subscriber premium';
  if (select pg_temp.can_see(paid_id)) is distinct from false then
    raise exception 'gate case failed: %', 'subscriber paid';
  end if;
  raise notice 'gate case ok: %', 'subscriber paid';

  -- Canceled but in period: free + premium.
  perform pg_temp.as_role('authenticated', canceled_id);
  if (select pg_temp.can_see(free_id)) is distinct from true then
    raise exception 'gate case failed: %', 'canceled free';
  end if;
  raise notice 'gate case ok: %', 'canceled free';
  if (select pg_temp.can_see(premium_id)) is distinct from true then
    raise exception 'gate case failed: %', 'canceled premium';
  end if;
  raise notice 'gate case ok: %', 'canceled premium';
  if (select pg_temp.can_see(paid_id)) is distinct from false then
    raise exception 'gate case failed: %', 'canceled paid';
  end if;
  raise notice 'gate case ok: %', 'canceled paid';

  -- Expired: free only.
  perform pg_temp.as_role('authenticated', expired_id);
  if (select pg_temp.can_see(free_id)) is distinct from true then
    raise exception 'gate case failed: %', 'expired free';
  end if;
  raise notice 'gate case ok: %', 'expired free';
  if (select pg_temp.can_see(premium_id)) is distinct from false then
    raise exception 'gate case failed: %', 'expired premium';
  end if;
  raise notice 'gate case ok: %', 'expired premium';
  if (select pg_temp.can_see(paid_id)) is distinct from false then
    raise exception 'gate case failed: %', 'expired paid';
  end if;
  raise notice 'gate case ok: %', 'expired paid';

  -- Buyer: free + purchased course, whatever its tier later becomes.
  perform pg_temp.as_role('authenticated', buyer_id);
  if (select pg_temp.can_see(free_id)) is distinct from true then
    raise exception 'gate case failed: %', 'buyer free';
  end if;
  raise notice 'gate case ok: %', 'buyer free';
  if (select pg_temp.can_see(paid_id)) is distinct from true then
    raise exception 'gate case failed: %', 'buyer paid';
  end if;
  raise notice 'gate case ok: %', 'buyer paid';
  if (select pg_temp.can_see(premium_id)) is distinct from false then
    raise exception 'gate case failed: %', 'buyer premium';
  end if;
  raise notice 'gate case ok: %', 'buyer premium';

  -- Refunded buyer: purchase grants nothing.
  perform pg_temp.as_role('authenticated', refunded_id);
  if (select pg_temp.can_see(free_id)) is distinct from true then
    raise exception 'gate case failed: %', 'refunded free';
  end if;
  raise notice 'gate case ok: %', 'refunded free';
  if (select pg_temp.can_see(paid_id)) is distinct from false then
    raise exception 'gate case failed: %', 'refunded paid';
  end if;
  raise notice 'gate case ok: %', 'refunded paid';

  -- Owner: everything, including drafts.
  perform pg_temp.as_role('authenticated', owner_id);
  if (select pg_temp.can_see(free_id)) is distinct from true then
    raise exception 'gate case failed: %', 'owner free';
  end if;
  raise notice 'gate case ok: %', 'owner free';
  if (select pg_temp.can_see(premium_id)) is distinct from true then
    raise exception 'gate case failed: %', 'owner premium';
  end if;
  raise notice 'gate case ok: %', 'owner premium';
  if (select pg_temp.can_see(paid_id)) is distinct from true then
    raise exception 'gate case failed: %', 'owner paid';
  end if;
  raise notice 'gate case ok: %', 'owner paid';
  if (select pg_temp.can_see(draft_id)) is distinct from true then
    raise exception 'gate case failed: %', 'owner draft';
  end if;
  raise notice 'gate case ok: %', 'owner draft';

  -- Admin: everything, including drafts.
  perform pg_temp.as_role('authenticated', admin_id);
  if (select pg_temp.can_see(free_id)) is distinct from true then
    raise exception 'gate case failed: %', 'admin free';
  end if;
  raise notice 'gate case ok: %', 'admin free';
  if (select pg_temp.can_see(premium_id)) is distinct from true then
    raise exception 'gate case failed: %', 'admin premium';
  end if;
  raise notice 'gate case ok: %', 'admin premium';
  if (select pg_temp.can_see(paid_id)) is distinct from true then
    raise exception 'gate case failed: %', 'admin paid';
  end if;
  raise notice 'gate case ok: %', 'admin paid';
  if (select pg_temp.can_see(draft_id)) is distinct from true then
    raise exception 'gate case failed: %', 'admin draft';
  end if;
  raise notice 'gate case ok: %', 'admin draft';
end;
$$;

-- ---------- Transparency rules ----------

-- A paid course that later becomes premium stays visible to its buyer.
-- Note: roles set with SET LOCAL inside the matrix block are discarded at
-- its end, so re-establish the buyer role before each transparency check.
update public.courses set access_tier = 'premium', price_cents = null
where id = '20000000-0000-0000-0000-000000000003';

do $$
declare
  ok boolean;
begin
  perform pg_temp.as_role('authenticated', '10000000-0000-0000-0000-000000000003');
  select exists (
    select 1 from public.course_content where course_id = '20000000-0000-0000-0000-000000000003'
  ) into ok;
  if not ok then
    raise exception 'tier-change transparency failed: buyer lost access after paid -> premium';
  end if;
  raise notice 'tier-change transparency ok: buyer keeps access';
  reset role;
end;
$$;

-- A refund removes access again.
update public.course_purchases set status = 'refunded', refunded_at = now()
where provider_payment_id = 'pay-live';

do $$
declare
  ok boolean;
begin
  perform pg_temp.as_role('authenticated', '10000000-0000-0000-0000-000000000003');
  select exists (
    select 1 from public.course_content where course_id = '20000000-0000-0000-0000-000000000003'
  ) into ok;
  if ok then
    raise exception 'refund transparency failed: buyer keeps access after refund';
  end if;
  raise notice 'refund transparency ok: access removed';
  reset role;
end;
$$;

reset role;

rollback;
