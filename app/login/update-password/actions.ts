"use server";

import { headers } from "next/headers";
import { isValidPassword, passwordLengthError } from "@/src/lib/auth/password";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { createServerSupabase } from "@/src/lib/supabase/server";
import type { AuthFormState } from "../actions";

// Password changes: 10 req/10 min per user and per IP, same quota shape (and
// RL_AUTH binding) as the sign-in limiter in ../actions.ts. Keys are
// namespaced ("pwupdate"/"pwupdate-ip") so quotas stay independent.
const limiter = createRouteLimiter({ limit: 10, windowMs: 10 * 60 * 1000, bindingName: "RL_AUTH" });

// Trimmed like the sign-in and sign-up fields in ../actions.ts, so a password
// set here can always be used to sign in.
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function updatePassword(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return { error: "This reset link is invalid or has expired. Request a new one from the sign-in page." };
  }

  // Validate before rate-limiting so typos never use up the quota; only
  // submissions that would reach updateUser count.
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");
  if (!isValidPassword(password)) {
    return { error: passwordLengthError() };
  }
  if (password !== confirm) {
    return { error: "Passwords don't match." };
  }

  const ip = clientIp(await headers());
  const userVerdict = await limiter.checkAsync(rateLimitKey("pwupdate", user.id));
  const ipVerdict = await limiter.checkAsync(rateLimitKey("pwupdate-ip", ip));
  if (!userVerdict.ok || !ipVerdict.ok) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Could not update the password. Try again." };
  }
  return { message: "Password updated. Taking you to Studio…" };
}
