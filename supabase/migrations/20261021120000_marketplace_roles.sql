-- SIG-1049: database foundation for the coach role.
--
-- * profiles.role accepts 'coach' (invite-only role between student and admin).
-- * profiles.role_source records whether a role was set by the system (signup
--   trigger / sign-in sync) or by hand from the admin UI ('manual'), so the
--   sign-in sync does not undo a manual promotion (used by SIG-1060).
-- * role_changes is the audit log of role changes; coach_invites holds hashed,
--   single-use, expiring invite tokens. Both are reachable only through the
--   service role: RLS deny-all, same pattern as public.course_admins.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('student', 'coach', 'admin'));

alter table public.profiles
  add column if not exists role_source text not null default 'system';
alter table public.profiles drop constraint if exists profiles_role_source_check;
alter table public.profiles
  add constraint profiles_role_source_check check (role_source in ('system', 'manual'));

create table if not exists public.role_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  old_role text not null,
  new_role text not null,
  changed_by uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  created_at timestamptz not null default now()
);

create index if not exists role_changes_user_created_idx
  on public.role_changes (user_id, created_at desc);

alter table public.role_changes enable row level security;
revoke all on table public.role_changes from anon, authenticated;

drop policy if exists "role_changes_no_client_access" on public.role_changes;
create policy "role_changes_no_client_access" on public.role_changes
  for select to authenticated
  using (false);

create table if not exists public.coach_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists coach_invites_email_idx
  on public.coach_invites (email);

alter table public.coach_invites enable row level security;
revoke all on table public.coach_invites from anon, authenticated;

drop policy if exists "coach_invites_no_client_access" on public.coach_invites;
create policy "coach_invites_no_client_access" on public.coach_invites
  for select to authenticated
  using (false);
