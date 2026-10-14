import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";

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

/**
 * Super-admin check: `app_metadata.role` is written server-side only (service
 * role via `finishSignIn`); clients never set it, they only read it here.
 * Allowlisted emails must have a confirmed email address.
 */
export function isCourseSuperAdmin(
  user: Pick<User, "email" | "app_metadata"> & { email_confirmed_at?: string | null },
): boolean {
  return (
    Boolean(user.email_confirmed_at && emailIsCourseAdmin(user.email)) ||
    user.app_metadata.role === "admin"
  );
}

/**
 * Only the service role can grant `app_metadata.role` (via
 * `admin.auth.admin.updateUserById` in `finishSignIn`). Browser clients and RLS
 * policies never write `app_metadata`; they are read-only here.
 * Allowlisted emails must have a confirmed email address.
 */
export async function userCanPublishCourses(
  supabase: SupabaseClient<Database>,
  user: Pick<User, "id" | "email" | "app_metadata"> & { email_confirmed_at?: string | null },
): Promise<boolean> {
  if (
    user.app_metadata.role === "admin" ||
    Boolean(user.email_confirmed_at && emailIsCourseAdmin(user.email))
  ) {
    return true;
  }
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error || !data) {
    return false;
  }
  return data.role === "admin";
}
