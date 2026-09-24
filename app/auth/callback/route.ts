import { NextResponse } from "next/server";
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
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(safeRedirectPath(url.searchParams.get("next")), url.origin));
}
