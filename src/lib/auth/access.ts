import { createServiceSupabase } from "@/src/lib/supabase/admin";
import { emailIsCourseAdmin } from "./course-permissions";

/** `null` when the `course_admins` lookup failed, so callers can skip role changes. */
async function emailIsListedAdmin(email: string): Promise<boolean | null> {
  if (emailIsCourseAdmin(email)) {
    return true;
  }
  const admin = createServiceSupabase();
  if (!admin) {
    return false;
  }
  const { data, error } = await admin
    .from("course_admins")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error("[auth] finishSignIn: course_admins lookup failed", { error });
    return null;
  }
  return Boolean(data);
}

/**
 * Sole writer of `app_metadata.role`: runs server-side with the service role.
 * Browser clients and RLS policies never write `app_metadata`.
 *
 * Reconciles the admin role with the current allowlist on every sign-in:
 * - Listed admin with a confirmed email: grants admin (profile + app_metadata).
 *   Fail-closed: unconfirmed or unknown confirmation state is never admin.
 * - Anyone else who currently holds admin (`appMetadata.role === "admin"` or
 *   `profiles.role === "admin"`) is revoked: profile set to student and
 *   `app_metadata.role` removed (GoTrue merges app_metadata and deletes keys
 *   set to null). This is how removal from `COURSE_ADMINS` / `course_admins`
 *   takes effect; the permission checks trust `app_metadata.role` until then.
 *
 * Failures are logged with an `[auth]` prefix and never thrown, so a role
 * sync problem cannot break sign-in. If the `course_admins` lookup itself
 * fails, roles are left as they are (no grant, no revoke).
 *
 * @param appMetadata the user's current `app_metadata` (from the session user).
 */
export async function finishSignIn(
  userId: string,
  email: string | null | undefined,
  emailConfirmedAt?: string | null,
  appMetadata?: Record<string, unknown> | null,
): Promise<void> {
  const admin = createServiceSupabase();
  if (!admin) {
    return;
  }
  try {
    const listed = email && emailConfirmedAt ? await emailIsListedAdmin(email) : false;
    if (listed === null) {
      // Allowlist unknown: neither grant nor revoke on a transient failure.
      return;
    }
    if (listed) {
      const { error: profileError } = await admin.from("profiles").upsert({ id: userId, role: "admin" });
      if (profileError) {
        console.error("[auth] finishSignIn: profile admin upsert failed", { userId, error: profileError });
      }
      const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { role: "admin" },
      });
      if (metaError) {
        console.error("[auth] finishSignIn: app_metadata admin grant failed", { userId, error: metaError });
      }
      return;
    }
    const { data, error: selectError } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (selectError) {
      console.error("[auth] finishSignIn: profile lookup failed", { userId, error: selectError });
    }
    if (!data && !selectError) {
      const { error } = await admin.from("profiles").insert({ id: userId, role: "student" });
      if (error) {
        console.error("[auth] finishSignIn: profile student insert failed", { userId, error });
      }
    }
    if (appMetadata?.role === "admin" || (data as { role?: string } | null)?.role === "admin") {
      const { error: profileError } = await admin.from("profiles").upsert({ id: userId, role: "student" });
      if (profileError) {
        console.error("[auth] finishSignIn: profile admin revoke failed", { userId, error: profileError });
      }
      const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { role: null },
      });
      if (metaError) {
        console.error("[auth] finishSignIn: app_metadata admin revoke failed", { userId, error: metaError });
      }
    }
  } catch (error) {
    console.error("[auth] finishSignIn: unexpected failure", { userId, error });
  }
}
