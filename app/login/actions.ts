"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { finishSignIn } from "@/src/lib/auth/access";
import type { AuthMessage } from "@/src/i18n/auth-strings";
import { isValidPassword, passwordLengthError } from "@/src/lib/auth/password";
import { safeAuthNext } from "@/src/lib/auth/redirect-path";
import { resolveSiteUrl } from "@/src/lib/auth/site-url";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { createServerSupabase } from "@/src/lib/supabase/server";

export type AuthFormState = { error?: AuthMessage; message?: AuthMessage };

// Auth abuse protection: 10 req/10 min per IP (fallback window). The native
// RL_AUTH binding only supports 10s/60s periods, so it enforces an additional
// 10 req/60s burst cap at the edge; the 10-min fallback window is always
// enforced too (see createRouteLimiter), preserving the original quota.
const limiter = createRouteLimiter({ limit: 10, windowMs: 10 * 60 * 1000, bindingName: "RL_AUTH" });

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function signInError(message: string): AuthMessage {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login")) {
    return { key: "auth.error.invalidCredentials" };
  }
  if (lower.includes("email not confirmed")) {
    return { key: "auth.error.emailNotConfirmed" };
  }
  return { key: "auth.error.signinFailed" };
}

export async function submitAuth(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { error: { key: "auth.error.supabaseNotConfigured" } };
  }
  const mode = field(formData, "mode");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  if (!email) {
    return { error: { key: "auth.error.enterEmail" } };
  }

  if (mode === "reset") {
    const headerStore = await headers();
    const ip = clientIp(headerStore);
    const verdict = await limiter.checkAsync(rateLimitKey("reset", ip));
    if (!verdict.ok) return { error: { key: "auth.error.rateLimited" } };
    const siteUrlResult = resolveSiteUrl({ origin: headerStore.get("origin") });
    if (!siteUrlResult.ok) {
      console.error("[auth] Site URL resolution failed:", siteUrlResult.cause);
      return { error: { key: "auth.error.resetSendFailed" } };
    }
    const redirectTo = `${siteUrlResult.url}/auth/callback?next=${encodeURIComponent("/login/update-password")}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      return { error: { key: "auth.error.resetSendFailed" } };
    }
    return { message: { key: "auth.message.resetSent" } };
  }

  const next = safeAuthNext(formData.get("next"));

  if (mode === "signup") {
    if (!isValidPassword(password)) {
      return { error: passwordLengthError() };
    }
    const headerStore = await headers();
    const ip = clientIp(headerStore);
    const verdict = await limiter.checkAsync(rateLimitKey("signup", ip));
    if (!verdict.ok) return { error: { key: "auth.error.rateLimited" } };
    const siteUrlResult = resolveSiteUrl({ origin: headerStore.get("origin") });
    if (!siteUrlResult.ok) {
      console.error("[auth] Site URL resolution failed:", siteUrlResult.cause);
      return { error: { key: "auth.error.signupFailed" } };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${siteUrlResult.url}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) return { error: { key: "auth.error.signupFailed" } };
    return { message: { key: "auth.message.signupConfirm" } };
  }

  if (!password) {
    return { error: { key: "auth.error.enterPassword" } };
  }

  // Sign-in is throttled per IP and per normalized email. The email key stops
  // a distributed guessing run against one account (many IPs); the IP key
  // stops one client spraying many accounts. Both share the `limiter`
  // instance (and RL_AUTH binding): keys are namespaced, so quotas are
  // independent. The verdict is identical whether or not the email exists.
  const headerStore = await headers();
  const ip = clientIp(headerStore);
  const ipVerdict = await limiter.checkAsync(rateLimitKey("signin", ip));
  const emailVerdict = await limiter.checkAsync(rateLimitKey("signin-email", email));
  if (!ipVerdict.ok || !emailVerdict.ok) {
    return { error: { key: "auth.error.rateLimited" } };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: signInError(error.message) };
  }
  if (data.user) {
    await finishSignIn(data.user.id, data.user.email, data.user.email_confirmed_at ?? null, data.user.app_metadata);
  }
  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/login");
}
