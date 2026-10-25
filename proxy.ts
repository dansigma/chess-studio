import type { NextRequest } from "next/server";
import { updateSession } from "@/src/lib/supabase/middleware";
import { applySecurityHeaders, buildCsp } from "@/src/lib/security-headers";

export async function proxy(request: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const csp = buildCsp({
    isDev: !isProd,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  });
  // Non-admin paths return from `updateSession` without a Supabase round trip;
  // security headers still apply to every response.
  const response = await updateSession(request);
  applySecurityHeaders(response, csp, isProd);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|engine/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm|js)$).*)",
  ],
};
