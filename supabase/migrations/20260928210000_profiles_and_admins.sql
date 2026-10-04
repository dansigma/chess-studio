-- Student profiles and the administrator allowlist for course publishing.
-- Role lives in profiles and in app_metadata. Clients cannot change either.

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

grant select on public.profiles to authenticated;

create table if not exists public.course_admins (
  email text primary key
);

alter table public.course_admins enable row level security;

revoke all on table public.course_admins from anon, authenticated;

drop policy if exists "course_admins_no_client_access" on public.course_admins;
create policy "course_admins_no_client_access" on public.course_admins
  for select to authenticated
  using (false);

-- Seed via dashboard or the COURSE_ADMINS env; never commit real emails.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned text := 'student';
begin
  if new.email is not null and exists (
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

revoke all on function private.handle_new_user() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema private to supabase_auth_admin;
    grant execute on function private.handle_new_user() to supabase_auth_admin;
  end if;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
