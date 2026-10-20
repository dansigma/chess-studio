-- SIG-1030: only confirmed emails may be auto-assigned the admin role.
--
-- The original private.handle_new_user() (20260928210000) granted admin on
-- INSERT for any email in public.course_admins, even when the address was
-- unconfirmed (e.g. local config had enable_confirmations = false), letting an
-- attacker claim an allowlisted address. Admin is now assigned only when
-- new.email_confirmed_at is not null.
--
-- No AFTER UPDATE OF email_confirmed_at trigger on purpose: the app's
-- finishSignIn (src/lib/auth/access.ts) promotes confirmed allowlisted users
-- at sign-in and revokes admin for everyone else, with the service role.
-- Keeping the DB trigger insert-only keeps the privileged surface minimal.
--
-- Function lives in the private schema (as originally created); signature,
-- security definer and empty search_path are unchanged. The existing
-- on_auth_user_created trigger and grants keep pointing at it.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned text := 'student';
begin
  if new.email is not null
     and new.email_confirmed_at is not null
     and exists (
       select 1 from public.course_admins where email = lower(new.email)
     ) then
    assigned := 'admin';
  end if;

  insert into public.profiles (id, role)
  values (new.id, assigned)
  on conflict (id) do update set role = excluded.role;

  if assigned = 'admin' then
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
    where id = new.id;
  end if;

  return new;
end;
$$;
