import { redirect } from "next/navigation";
import { listReviewQueueAction } from "@/app/admin/courses/actions";
import { getRole, isAdmin } from "@/src/lib/auth/roles";
import { createServerSupabase } from "@/src/lib/supabase/server";
import { CourseReviewQueue } from "@/src/admin/CourseReviewQueue";
import { SiteHeader } from "@/src/site/SiteHeader";

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
  const initialRows = first.ok ? first.data.rows : [];
  return (
    <div className="min-h-full bg-studio-bg text-studio-fg">
      <SiteHeader admin isAdmin reviewCount={initialRows.length} />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <CourseReviewQueue initialRows={initialRows} />
      </main>
    </div>
  );
}
