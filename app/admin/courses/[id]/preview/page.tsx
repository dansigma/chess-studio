import { notFound, redirect } from "next/navigation";
import { getReviewCourseAction } from "@/app/admin/courses/actions";
import { getRole, isAdmin } from "@/src/lib/auth/roles";
import { createServerSupabase } from "@/src/lib/supabase/server";
import { toPreviewCourse } from "@/src/courses/catalog";
import { CourseView } from "@/src/courses/CourseView";

export const metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCoursePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = data?.user;
  if (!user) {
    redirect(`/login?next=/admin/courses/${id}/preview`);
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
  return <CourseView course={course} />;
}
