import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";
import { getRole, isAdmin } from "./roles";

export { courseAdminEmails, emailIsCourseAdmin } from "./roles";

/**
 * Super-admin check: `profiles.role` is the source of truth, read from the
 * database on every check, so revocation takes effect immediately.
 * A confirmed allowlisted email is always admin (break-glass).
 */
export async function isCourseSuperAdmin(
  supabase: SupabaseClient<Database>,
  user: Pick<User, "id" | "email"> & { email_confirmed_at?: string | null },
): Promise<boolean> {
  return isAdmin(await getRole(supabase, user));
}

/**
 * Publishing stays admin-only: the allowlist (via `getRole`) and
 * `profiles.role === "admin"` grant it; coaches are refused.
 */
export async function userCanPublishCourses(
  supabase: SupabaseClient<Database>,
  user: Pick<User, "id" | "email"> & { email_confirmed_at?: string | null },
): Promise<boolean> {
  return isAdmin(await getRole(supabase, user));
}
