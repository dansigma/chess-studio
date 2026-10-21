import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/src/lib/supabase/middleware";
import { CSP_REPORT_PATH } from "@/src/lib/csp-report";
import { applySecurityHeaders, buildCsp } from "@/src/lib/security-headers";

export async function proxy(request: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const csp = buildCsp({
    isDev: !isProd,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  });
  // CSP reports need no session; skip the Supabase round-trip so a burst of reports does not cost
  // one auth call each.
  const response =
    request.nextUrl.pathname === CSP_REPORT_PATH ? NextResponse.next() : await updateSession(request);
  applySecurityHeaders(response, csp, isProd);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|engine/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm|js)$).*)",
  ],
};
