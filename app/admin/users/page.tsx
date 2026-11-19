import { redirect } from "next/navigation";
import { listUsersAction } from "@/app/admin/users/actions";
import { getRole, isAdmin } from "@/src/lib/auth/roles";
import { createServerSupabase } from "@/src/lib/supabase/server";
import { UsersView } from "@/src/admin/UsersView";
import { SiteHeader } from "@/src/site/SiteHeader";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage() {
  const supabase = await createServerSupabase();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = data?.user;
  if (!user) {
    redirect("/login?next=/admin/users");
  }
  if (!supabase || !isAdmin(await getRole(supabase, user))) {
    redirect("/courses");
  }
  const first = await listUsersAction({ page: 1 });
  return (
    <div className="min-h-full bg-studio-bg text-studio-fg">
      <SiteHeader admin isAdmin />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <UsersView
          initialUsers={first.ok ? first.data.users : []}
          initialTotal={first.ok ? first.data.total : 0}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}
