-- SIG-1062: single-use coach invite acceptance.
--
-- `public.accept_coach_invite(p_token_hash, p_email, p_user_id)` is called only
-- by the service role (via `src/lib/admin/coach-invites.ts`), which passes the
-- SHA-256 hex of the invite token — the raw token never reaches Postgres logs.
-- The invite row is locked (`for update`) before any guard so two concurrent
-- accepts serialize; the loser reads `accepted_at` and gets `consumed`.
--
-- Guard order: invalid (null/empty hash) -> not_found (unknown hash) ->
-- expired -> revoked -> consumed -> email_mismatch -> role_unchanged
-- (already coach/admin; admins are never downgraded). Only `student -> coach`
-- promotes, stamped `role_source = 'manual'` with a `role_changes` audit row.

create or replace function public.accept_coach_invite(p_token_hash text, p_email text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.coach_invites%rowtype;
  v_role text;
begin
  if p_token_hash is null or btrim(p_token_hash) = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  select * into v_invite
  from public.coach_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_invite.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  if v_invite.revoked_at is not null then
    return jsonb_build_object('ok', false, 'code', 'revoked');
  end if;

  if v_invite.accepted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'consumed');
  end if;

  if p_email is null or lower(p_email) <> v_invite.email then
    return jsonb_build_object('ok', false, 'code', 'email_mismatch');
  end if;

  select role into v_role from public.profiles where id = p_user_id;

  if v_role = 'coach' or v_role = 'admin' then
    return jsonb_build_object('ok', false, 'code', 'role_unchanged');
  end if;

  if v_role is null or v_role <> 'student' then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  update public.coach_invites
  set accepted_at = now()
  where id = v_invite.id;

  update public.profiles
  set role = 'coach', role_source = 'manual'
  where id = p_user_id;

  insert into public.role_changes (user_id, old_role, new_role, changed_by, reason)
  values (p_user_id, v_role, 'coach', v_invite.invited_by, 'coach invite accepted');

  return jsonb_build_object('ok', true, 'code', 'accepted');
end;
$$;

revoke all on function public.accept_coach_invite(text, text, uuid) from public, anon, authenticated;
grant execute on function public.accept_coach_invite(text, text, uuid) to service_role;
