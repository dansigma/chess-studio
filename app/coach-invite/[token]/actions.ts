"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { acceptInvite, CoachInviteError } from "@/src/lib/admin/coach-invites";
import type { AcceptCode, InviteAdminCode } from "@/src/lib/admin/coach-invites";
import type { CoachInviteResultCode } from "@/src/admin/rules";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { createServerSupabase } from "@/src/lib/supabase/server";

export type AcceptInviteActionState =
  | { status: "idle" }
  | { status: "done"; code: CoachInviteResultCode };

// Coach invite acceptance: 10 req/10 min per IP (credential issuance, same
// auth-shaped quota as the mint path). The raw token stays in the path — it
// is never logged.
const acceptLimiter = createRouteLimiter({ limit: 10, windowMs: 10 * 60 * 1000, bindingName: "RL_AUTH" });

function toResultCode(code: AcceptCode | InviteAdminCode): CoachInviteResultCode {
  switch (code) {
    case "accepted":
    case "invalid":
    case "not_found":
    case "expired":
    case "revoked":
    case "consumed":
    case "email_mismatch":
    case "role_unchanged":
    case "unavailable":
      return code;
    default:
      return "unavailable";
  }
}

/**
 * Accepts a coach invite on explicit form submission (POST), rather than GET,
 * so link scanners and prefetchers cannot consume the single-use token.
 */
// Bound with `.bind(null, token)` and passed to useActionState; the previous
// state and the (empty) form data it appends are not needed.
export async function acceptCoachInviteAction(token: string): Promise<AcceptInviteActionState> {
  const rawToken = typeof token === "string" ? token : "";
  const supabase = await createServerSupabase();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = data?.user;
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/coach-invite/${rawToken}`)}`);
  }
  if (!rawToken.trim()) {
    return { status: "done", code: "invalid" };
  }
  const ip = clientIp(await headers());
  const verdict = await acceptLimiter.checkAsync(rateLimitKey("coach-invite-accept", ip));
  if (!verdict.ok) {
    return { status: "done", code: "rate_limited" };
  }
  let code: CoachInviteResultCode;
  try {
    const result = await acceptInvite({
      token: rawToken,
      userId: user.id,
      email: user.email ?? "",
      emailConfirmedAt: user.email_confirmed_at ?? null,
    });
    code = toResultCode(result.code);
  } catch (error) {
    code = error instanceof CoachInviteError ? toResultCode(error.code) : "unavailable";
  }
  return { status: "done", code };
}
