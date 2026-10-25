-- SIG-1061: role management RPCs (admin UI backend).
--
-- Two service-role-only functions for the /admin/users backend:
-- * set_user_role atomically changes a role (profile update plus
--   role_changes audit row) and is safe against races: it serializes
--   concurrent calls with pg_advisory_xact_lock, locks the profile row
--   for update, refuses self-demotion, and never demotes the last admin.
--   Success marks the profile role_source = 'manual' so the sign-in sync
--   (src/lib/auth/access.ts) never undoes a manual promotion.
-- * admin_list_users joins auth.users (the only place emails live) with
--   profiles, because the client cannot read auth.users. Search is an
--   escaped case-insensitive email substring (strpos, no LIKE wildcards).
-- Both are security definer with an empty search_path, revoked from every
-- client role and granted only to service_role. Access goes through the
-- service client (src/lib/admin/users.ts), never from the browser.

create or replace function public.set_user_role(p_user_id uuid, p_new_role text, p_changed_by uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_admin_count integer;
begin
  if p_new_role not in ('student', 'coach', 'admin') then
    raise exception 'invalid_role';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'invalid_reason';
  end if;
  perform pg_advisory_xact_lock(hashtext('set_user_role'));
  select role into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if p_user_id = p_changed_by then
    raise exception 'own_role';
  end if;
  if v_old = p_new_role then
    raise exception 'unchanged';
  end if;
  if v_old = 'admin' and p_new_role <> 'admin' then
    select count(*) into v_admin_count from public.profiles where role = 'admin' and id <> p_user_id;
    if v_admin_count = 0 then
      raise exception 'last_admin';
    end if;
  end if;
  update public.profiles set role = p_new_role, role_source = 'manual' where id = p_user_id;
  insert into public.role_changes (user_id, old_role, new_role, changed_by, reason)
  values (p_user_id, v_old, p_new_role, p_changed_by, v_reason);
  return v_old;
end;
$$;

revoke execute on function public.set_user_role(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_user_role(uuid, text, uuid, text) to service_role;

create or replace function public.admin_list_users(p_search text, p_role text, p_limit int, p_offset int)
returns table (id uuid, email text, role text, created_at timestamptz, email_confirmed boolean, total bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if p_role is not null and p_role not in ('student', 'coach', 'admin') then
    raise exception 'invalid_role';
  end if;
  return query
  select u.id, u.email::text, p.role, u.created_at, (u.email_confirmed_at is not null),
         count(*) over ()::bigint
  from auth.users u
  join public.profiles p on p.id = u.id
  where (v_search is null or strpos(lower(u.email), lower(v_search)) > 0)
    and (p_role is null or p.role = p_role)
  order by u.created_at desc
  limit v_limit offset v_offset;
end;
$$;

revoke execute on function public.admin_list_users(text, text, int, int) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, text, int, int) to service_role;
