import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { InviteResult } from "@/src/admin/InviteResult";
import { acceptInvite, CoachInviteError } from "@/src/lib/admin/coach-invites";
import type { AcceptCode, InviteAdminCode } from "@/src/lib/admin/coach-invites";
import type { CoachInviteResultCode } from "@/src/admin/rules";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { createServerSupabase } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

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

export default async function CoachInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createServerSupabase();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = data?.user;
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/coach-invite/${token}`)}`);
  }
  const ip = clientIp(await headers());
  const verdict = await acceptLimiter.checkAsync(rateLimitKey("coach-invite-accept", ip));
  if (!verdict.ok) {
    return <InviteResult code="rate_limited" />;
  }
  let code: CoachInviteResultCode;
  try {
    const result = await acceptInvite({
      token,
      userId: user.id,
      email: user.email ?? "",
      emailConfirmedAt: user.email_confirmed_at ?? null,
    });
    code = toResultCode(result.code);
  } catch (error) {
    code = error instanceof CoachInviteError ? toResultCode(error.code) : "unavailable";
  }
  return <InviteResult code={code} />;
}
