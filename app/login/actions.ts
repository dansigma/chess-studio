"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { finishSignIn } from "@/src/lib/auth/access";
import { safeAuthNext } from "@/src/lib/auth/redirect-path";
import { clientIp, createRateLimiter } from "@/src/lib/rate-limit";
import { createServerSupabase } from "@/src/lib/supabase/server";

export type AuthFormState = { error?: string; message?: string };

const limiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

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

async function requestOrigin(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get("origin") ?? "http://localhost:3000";
}

async function siteUrl(): Promise<string> {
  return process.env.NEXT_PUBLIC_SITE_URL ?? (await requestOrigin());
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
    const ip = clientIp(await headers());
    if (ip !== "unknown") {
      const verdict = limiter.check(`reset:${ip}`);
      if (!verdict.ok) return { error: "Too many attempts. Wait a few minutes and try again." };
    }
    const base = await siteUrl();
    const redirectTo = `${base}/auth/callback?next=${encodeURIComponent("/login/update-password")}`;
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
    const ip = clientIp(await headers());
    if (ip !== "unknown") {
      const verdict = limiter.check(`signup:${ip}`);
      if (!verdict.ok) return { error: "Too many attempts. Wait a few minutes and try again." };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) return { error: "Could not create the account. Try again." };
    return { message: "Check your email to confirm your account, then sign in." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: signInError(error.message) };
  }
  if (data.user) {
    await finishSignIn(data.user.id, data.user.email);
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
