import { redirect } from "next/navigation";
import { InviteResult } from "@/src/admin/InviteResult";
import { SiteHeader } from "@/src/site/SiteHeader";
import { createServerSupabase } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function CoachInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createServerSupabase();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = data?.user;
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/coach-invite/${token}`)}`);
  }
  return (
    <div className="min-h-full bg-studio-bg text-studio-fg">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-10">
        <InviteResult token={token} userEmail={user.email ?? ""} />
      </main>
    </div>
  );
}
