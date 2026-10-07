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

export function isCourseSuperAdmin(user: Pick<User, "email" | "app_metadata">): boolean {
  return emailIsCourseAdmin(user.email) || user.app_metadata.role === "admin";
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
