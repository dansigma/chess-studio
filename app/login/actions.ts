"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { finishSignIn } from "@/src/lib/auth/access";
import { safeAuthNext } from "@/src/lib/auth/redirect-path";
import { resolveSiteUrl } from "@/src/lib/auth/site-url";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { createServerSupabase } from "@/src/lib/supabase/server";

export type AuthFormState = { error?: string; message?: string };

// Auth abuse protection: 10 req/10 min per IP (fallback window). The native
// RL_AUTH binding only supports 10s/60s periods, so it enforces an additional
// 10 req/60s burst cap at the edge; the 10-min fallback window is always
// enforced too (see createRouteLimiter), preserving the original quota.
const limiter = createRouteLimiter({ limit: 10, windowMs: 10 * 60 * 1000, bindingName: "RL_AUTH" });

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function signInError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login")) {
    return "Email or password is incorrect.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirm your email, then sign in.";
  }
  return "Could not sign in. Try again.";
}

export async function submitAuth(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }
  const mode = field(formData, "mode");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  if (!email) {
    return { error: "Enter an email address." };
  }

  if (mode === "reset") {
    const headerStore = await headers();
    const ip = clientIp(headerStore);
    const verdict = await limiter.checkAsync(rateLimitKey("reset", ip));
    if (!verdict.ok) return { error: "Too many attempts. Wait a few minutes and try again." };
    const siteUrlResult = resolveSiteUrl({ origin: headerStore.get("origin") });
    if (!siteUrlResult.ok) {
      console.error("[auth] Site URL resolution failed:", siteUrlResult.cause);
      return { error: "Could not send the reset link. Try again." };
    }
    const redirectTo = `${siteUrlResult.url}/auth/callback?next=${encodeURIComponent("/login/update-password")}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      return { error: "Could not send the reset link. Try again." };
    }
    return { message: "If an account exists for that email, a reset link is on its way." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const next = safeAuthNext(formData.get("next"));

  if (mode === "signup") {
    const headerStore = await headers();
    const ip = clientIp(headerStore);
    const verdict = await limiter.checkAsync(rateLimitKey("signup", ip));
    if (!verdict.ok) return { error: "Too many attempts. Wait a few minutes and try again." };
    const siteUrlResult = resolveSiteUrl({ origin: headerStore.get("origin") });
    if (!siteUrlResult.ok) {
      console.error("[auth] Site URL resolution failed:", siteUrlResult.cause);
      return { error: "Could not create the account. Try again." };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${siteUrlResult.url}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) return { error: "Could not create the account. Try again." };
    return { message: "Check your email to confirm your account, then sign in." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: signInError(error.message) };
  }
  if (data.user) {
    await finishSignIn(data.user.id, data.user.email, data.user.email_confirmed_at ?? null);
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
