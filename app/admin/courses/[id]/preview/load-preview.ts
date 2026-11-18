import { notFound, redirect } from "next/navigation";
import { getReviewCourseAction } from "@/app/admin/courses/actions";
import { getRole, isAdmin } from "@/src/lib/auth/roles";
import { createServerSupabase } from "@/src/lib/supabase/server";
import { toPreviewCourse } from "@/src/courses/catalog";
import type { Course } from "@/src/courses/types";

/**
 * Shared auth/admin gate and service-backed course loader for the admin
 * preview routes (`/admin/courses/[id]/preview` and its `[variationId]` child).
 */
export async function loadPreviewCourse(id: string, nextPath: string): Promise<Course> {
  const supabase = await createServerSupabase();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = data?.user;
  if (!user) {
    redirect(`/login?next=${nextPath}`);
  }
  if (!supabase || !isAdmin(await getRole(supabase, user))) {
    redirect("/courses");
  }
  const result = await getReviewCourseAction(id);
  if (!result.ok) {
    notFound();
  }
  const course = toPreviewCourse(result.data.row);
  if (!course) {
    notFound();
  }
  return course;
}
