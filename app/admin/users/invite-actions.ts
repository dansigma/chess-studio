"use server";

import { headers } from "next/headers";
import { getRole, isAdmin } from "@/src/lib/auth/roles";
import { resolveSiteUrl } from "@/src/lib/auth/site-url";
import { CoachInviteError, createInvite, listInvites, resendInvite, revokeInvite } from "@/src/lib/admin/coach-invites";
import type { CoachInviteRow, InviteAdminCode } from "@/src/lib/admin/coach-invites";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { createServerSupabase } from "@/src/lib/supabase/server";

// Coach invite management: 10 req/10 min per admin and per IP (invite minting
// is credential issuance, so the tighter auth-shaped quota applies, not the
// 30/min users-table quota). Keys are namespaced per action family so listing
// never burns the create quota; both share the RL_AUTH binding family.
const createLimiter = createRouteLimiter({ limit: 10, windowMs: 10 * 60 * 1000, bindingName: "RL_AUTH" });
const manageLimiter = createRouteLimiter({ limit: 10, windowMs: 10 * 60 * 1000, bindingName: "RL_AUTH" });

export type InviteActionCode = InviteAdminCode | "forbidden" | "rate_limited";

export type InviteActionResult<T> = { ok: true; data: T } | { ok: false; code: InviteActionCode };

export interface CreatedInviteLink {
  id: string;
  /** `<site origin>/coach-invite/<token>` — the raw token appears only here, once. */
  link: string;
  expiresAt: string;
}

async function adminCaller(): Promise<{ ok: true; userId: string } | { ok: false; code: "forbidden" }> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { ok: false, code: "forbidden" };
  }
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return { ok: false, code: "forbidden" };
  }
  if (!isAdmin(await getRole(supabase, user))) {
    return { ok: false, code: "forbidden" };
  }
  return { ok: true, userId: user.id };
}

// Quota is consumed only after inputs validate (mirroring
// app/admin/users/actions.ts), so malformed requests never burn the shared
// per-IP bucket.
async function consumeQuota(
  limiter: ReturnType<typeof createRouteLimiter>,
  route: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; code: "rate_limited" }> {
  const ip = clientIp(await headers());
  const userVerdict = await limiter.checkAsync(rateLimitKey(`${route}`, userId));
  const ipVerdict = await limiter.checkAsync(rateLimitKey(`${route}-ip`, ip));
  if (!userVerdict.ok || !ipVerdict.ok) {
    return { ok: false, code: "rate_limited" };
  }
  return { ok: true };
}

function inviteError(error: unknown): InviteActionResult<never> {
  if (error instanceof CoachInviteError) {
    const code = error.code as InviteActionCode | string;
    if (code === "forbidden" || code === "unavailable" || code === "invalid_email" || code === "not_found") {
      return { ok: false, code };
    }
  }
  return { ok: false, code: "unavailable" };
}

async function inviteLink(): Promise<{ ok: true; origin: string } | { ok: false; code: "unavailable" }> {
  const headerStore = await headers();
  const siteUrlResult = resolveSiteUrl({ origin: headerStore.get("origin") });
  if (!siteUrlResult.ok) {
    console.error("[coach-invites] Site URL resolution failed:", siteUrlResult.cause);
    return { ok: false, code: "unavailable" };
  }
  return { ok: true, origin: siteUrlResult.url };
}

export async function createInviteAction(input: { email: string }): Promise<InviteActionResult<CreatedInviteLink>> {
  if (typeof input.email !== "string" || !input.email.trim()) {
    return { ok: false, code: "invalid_email" };
  }
  const gate = await adminCaller();
  if (!gate.ok) {
    return gate;
  }
  const quota = await consumeQuota(createLimiter, "coach-invite-create", gate.userId);
  if (!quota.ok) {
    return quota;
  }
  const origin = await inviteLink();
  if (!origin.ok) {
    return origin;
  }
  try {
    const created = await createInvite({ callerRole: "admin", email: input.email, invitedBy: gate.userId });
    return { ok: true, data: { id: created.id, link: `${origin.origin}/coach-invite/${created.token}`, expiresAt: created.expiresAt } };
  } catch (error) {
    return inviteError(error);
  }
}

export async function listInvitesAction(): Promise<InviteActionResult<{ invites: CoachInviteRow[] }>> {
  const gate = await adminCaller();
  if (!gate.ok) {
    return gate;
  }
  const quota = await consumeQuota(manageLimiter, "coach-invite-manage", gate.userId);
  if (!quota.ok) {
    return quota;
  }
  try {
    const invites = await listInvites({ callerRole: "admin" });
    return { ok: true, data: { invites } };
  } catch (error) {
    return inviteError(error);
  }
}

export async function revokeInviteAction(input: { id: string }): Promise<InviteActionResult<null>> {
  if (typeof input.id !== "string" || !input.id) {
    return { ok: false, code: "not_found" };
  }
  const gate = await adminCaller();
  if (!gate.ok) {
    return gate;
  }
  const quota = await consumeQuota(manageLimiter, "coach-invite-manage", gate.userId);
  if (!quota.ok) {
    return quota;
  }
  try {
    await revokeInvite({ callerRole: "admin", inviteId: input.id });
    return { ok: true, data: null };
  } catch (error) {
    return inviteError(error);
  }
}

export async function resendInviteAction(input: { id: string }): Promise<InviteActionResult<CreatedInviteLink>> {
  if (typeof input.id !== "string" || !input.id) {
    return { ok: false, code: "not_found" };
  }
  const gate = await adminCaller();
  if (!gate.ok) {
    return gate;
  }
  const quota = await consumeQuota(manageLimiter, "coach-invite-manage", gate.userId);
  if (!quota.ok) {
    return quota;
  }
  const origin = await inviteLink();
  if (!origin.ok) {
    return origin;
  }
  try {
    const created = await resendInvite({ callerRole: "admin", inviteId: input.id, invitedBy: gate.userId });
    return { ok: true, data: { id: created.id, link: `${origin.origin}/coach-invite/${created.token}`, expiresAt: created.expiresAt } };
  } catch (error) {
    return inviteError(error);
  }
}
