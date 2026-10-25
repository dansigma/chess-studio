import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";

export type Role = "student" | "coach" | "admin";

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

export function isAdmin(role: Role | null | undefined): boolean {
  return role === "admin";
}

export function isCoach(role: Role | null | undefined): boolean {
  return role === "coach";
}

export function canAuthorCourses(role: Role | null | undefined): boolean {
  return role === "admin" || role === "coach";
}

type RoleUser = Pick<User, "id" | "email"> & { email_confirmed_at?: string | null };

/**
 * Single source of truth for course roles.
 *
 * `profiles.role` is authoritative and read from the database on every check,
 * so a revocation takes effect immediately without a new sign-in.
 * A confirmed allowlisted email (`COURSE_ADMINS`) is always admin
 * (break-glass) and returns without a query.
 *
 * Fail-closed: query errors, missing rows, and unexpected values return null.
 */
export async function getRole(
  supabase: SupabaseClient<Database>,
  user: RoleUser,
): Promise<Role | null> {
  if (user.email_confirmed_at && emailIsCourseAdmin(user.email)) {
    return "admin";
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const role = (data as { role?: unknown }).role;
  if (role === "admin" || role === "coach" || role === "student") {
    return role;
  }
  return null;
}
