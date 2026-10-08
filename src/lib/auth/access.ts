import { createServiceSupabase } from "@/src/lib/supabase/admin";
import { emailIsCourseAdmin } from "./course-permissions";

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

/**
 * Sole writer of `app_metadata.role`: runs server-side with the service role.
 * Browser clients and RLS policies never write `app_metadata`.
 */
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
