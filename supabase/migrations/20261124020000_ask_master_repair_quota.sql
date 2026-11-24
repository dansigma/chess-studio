drop function public.record_ask_master_model_request();

create function public.record_ask_master_model_request(p_site_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (pg_catalog.now() at time zone 'utc')::date;
begin
  if p_site_limit is null or p_site_limit < 1 then
    return false;
  end if;

  insert into public.ask_master_usage as usage (day, model_requests)
    values (today, 1)
    on conflict (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), day)
    do update set model_requests = usage.model_requests + 1
    where usage.model_requests < p_site_limit;

  return found;
end;
$$;

revoke all on function public.record_ask_master_model_request(int)
  from public, anon, authenticated;
grant execute on function public.record_ask_master_model_request(int) to service_role;
