-- SIG-1474: reserve question and model usage against shared UTC-day counters.
create table public.ask_master_usage (
  user_id uuid references auth.users (id) on delete cascade
    check (user_id <> '00000000-0000-0000-0000-000000000000'::uuid),
  day date not null,
  questions int not null default 0 check (questions >= 0),
  model_requests int not null default 0 check (model_requests >= 0)
);

create unique index ask_master_usage_daily_key on public.ask_master_usage
  (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), day);
create index ask_master_usage_user_day_idx on public.ask_master_usage (user_id, day);

alter table public.ask_master_usage enable row level security;

create policy "ask_master_usage_select_own"
  on public.ask_master_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.ask_master_usage from public, anon, authenticated;
-- The publishable-key schema probe needs SELECT. RLS exposes no rows to anon.
grant select on public.ask_master_usage to anon, authenticated;

-- Called only by the server route (service role) after it has verified the
-- user, so a signed-in user cannot call it directly with their own limits.
create or replace function public.consume_ask_master_question(p_user_id uuid, p_user_limit int, p_site_limit int)
returns table (allowed boolean, reason text, remaining int)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := p_user_id;
  today date := (now() at time zone 'utc')::date;
  site_requests int;
  user_questions int;
begin
  if caller_id is null then
    return query select false, 'unauthenticated'::text, 0;
    return;
  end if;

  if p_user_limit is null or p_user_limit < 1 or p_site_limit is null or p_site_limit < 1 then
    return query select false, 'error'::text, 0;
    return;
  end if;

  insert into public.ask_master_usage (day)
    values (today)
    on conflict do nothing;

  -- Every consumer locks the site row before reading the user's count.
  -- The service upsert also takes this row lock when incrementing usage.
  select model_requests into site_requests
    from public.ask_master_usage
    where user_id is null and day = today
    for update;

  select questions into user_questions
    from public.ask_master_usage
    where user_id = caller_id and day = today;
  user_questions := coalesce(user_questions, 0);

  if user_questions >= p_user_limit then
    return query select false, 'user_limit'::text, 0;
    return;
  end if;

  if site_requests >= p_site_limit then
    return query select false, 'site_limit'::text, p_user_limit - user_questions;
    return;
  end if;

  insert into public.ask_master_usage as usage (user_id, day, questions)
    values (caller_id, today, 1)
    on conflict (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), day)
    do update set questions = usage.questions + 1
    returning questions into user_questions;

  update public.ask_master_usage
    set model_requests = model_requests + 1
    where user_id is null and day = today;

  return query select true, null::text, p_user_limit - user_questions;
end;
$$;

revoke all on function public.consume_ask_master_question(uuid, int, int)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_ask_master_question(uuid, int, int) to service_role;

create or replace function public.record_ask_master_model_request()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ask_master_usage as usage (day, model_requests)
    values ((now() at time zone 'utc')::date, 1)
    on conflict (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), day)
    do update set model_requests = usage.model_requests + 1;
$$;

revoke all on function public.record_ask_master_model_request()
  from public, anon, authenticated, service_role;
grant execute on function public.record_ask_master_model_request() to service_role;
