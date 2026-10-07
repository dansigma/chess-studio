import { NextResponse } from "next/server";
import { finishSignIn } from "@/src/lib/auth/access";
import { safeAuthNext } from "@/src/lib/auth/redirect-path";
import { createServerSupabase } from "@/src/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await createServerSupabase();
  if (code && supabase) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("auth callback exchange failed", { error });
      return NextResponse.redirect(new URL("/login?error=auth", url.origin));
    }
    if (data.user) {
      await finishSignIn(data.user.id, data.user.email);
    }
  }
  return NextResponse.redirect(new URL(safeAuthNext(url.searchParams.get("next")), url.origin));
}
