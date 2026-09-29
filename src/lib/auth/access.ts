import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";
import { createServiceSupabase } from "@/src/lib/supabase/admin";

export function courseAdminEmails(): Set<string> {
  return new Set(
    (process.env.COURSE_ADMINS ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function emailIsCourseAdmin(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  return courseAdminEmails().has(email.toLowerCase());
}

export async function userCanPublishCourses(
  supabase: SupabaseClient<Database>,
  user: Pick<User, "id" | "email" | "app_metadata">,
): Promise<boolean> {
  if (user.app_metadata.role === "admin" || emailIsCourseAdmin(user.email)) {
    return true;
  }
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error || !data) {
    return false;
  }
  return data.role === "admin";
}

async function emailIsListedAdmin(email: string): Promise<boolean> {
  if (emailIsCourseAdmin(email)) {
    return true;
  }
  const admin = createServiceSupabase();
  if (!admin) {
    return false;
  }
  const { data } = await admin.from("course_admins").select("email").eq("email", email.toLowerCase()).maybeSingle();
  return Boolean(data);
}

export async function createConfirmedUser(
  email: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const admin = createServiceSupabase();
  if (!admin) {
    return { ok: false, error: "The server cannot create accounts yet." };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    const lower = error.message.toLowerCase();
    if (lower.includes("already") || lower.includes("registered") || error.code === "email_exists") {
      return { ok: false, error: "An account with that email already exists. Sign in instead." };
    }
    if (lower.includes("rate limit")) {
      return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
    }
    return { ok: false, error: error.message };
  }
  if (!data.user) {
    return { ok: false, error: "Could not create the account." };
  }
  return { ok: true, userId: data.user.id };
}

export async function finishSignIn(userId: string, email: string | null | undefined): Promise<void> {
  const admin = createServiceSupabase();
  if (!admin) {
    return;
  }
  const allow = email ? await emailIsListedAdmin(email) : false;
  if (allow) {
    await admin.from("profiles").upsert({ id: userId, role: "admin" });
    await admin.auth.admin.updateUserById(userId, { app_metadata: { role: "admin" } });
    return;
  }
  const { data } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!data) {
    await admin.from("profiles").insert({ id: userId, role: "student" });
  }
}
