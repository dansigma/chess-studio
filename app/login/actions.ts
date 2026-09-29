"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createConfirmedUser, finishSignIn } from "@/src/lib/auth/access";
import { createServerSupabase } from "@/src/lib/supabase/server";

export type AuthFormState = { error?: string; message?: string };

function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return value;
  }
  return "/studio";
}

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
  return message;
}

async function requestOrigin(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get("origin") ?? "http://localhost:3000";
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
    const origin = await requestOrigin();
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/login/update-password")}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      return { error: error.message };
    }
    return { message: "If an account exists for that email, a reset link is on its way." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const next = safeNext(formData.get("next"));

  if (mode === "signup") {
    const created = await createConfirmedUser(email, password);
    if (!created.ok) {
      return { error: created.error };
    }
    const signedIn = await supabase.auth.signInWithPassword({ email, password });
    if (signedIn.error) {
      return { error: signInError(signedIn.error.message) };
    }
    await finishSignIn(created.userId, email);
    redirect(next);
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
