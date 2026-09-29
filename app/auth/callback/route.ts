import { NextResponse } from "next/server";
import { finishSignIn } from "@/src/lib/auth/access";
import { createServerSupabase } from "@/src/lib/supabase/server";

function safeRedirectPath(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    return next;
  }
  return "/studio";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await createServerSupabase();
  if (code && supabase) {
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    if (data.user) {
      await finishSignIn(data.user.id, data.user.email);
    }
  }
  return NextResponse.redirect(new URL(safeRedirectPath(url.searchParams.get("next")), url.origin));
}
