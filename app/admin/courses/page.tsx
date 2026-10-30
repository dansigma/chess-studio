import { redirect } from "next/navigation";
import { listReviewQueueAction } from "@/app/admin/courses/actions";
import { getRole, isAdmin } from "@/src/lib/auth/roles";
import { createServerSupabase } from "@/src/lib/supabase/server";
import { CourseReviewQueue } from "@/src/admin/CourseReviewQueue";

export const metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCoursesPage() {
  const supabase = await createServerSupabase();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = data?.user;
  if (!user) {
    redirect("/login?next=/admin/courses");
  }
  if (!supabase || !isAdmin(await getRole(supabase, user))) {
    redirect("/courses");
  }
  const first = await listReviewQueueAction();
  return <CourseReviewQueue initialRows={first.ok ? first.data.rows : []} />;
}
