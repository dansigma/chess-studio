import { type NextRequest } from "next/server";
import { updateSession } from "@/src/lib/supabase/middleware";
import { CSP_HEADER, applySecurityHeaders, buildCsp, generateNonce } from "@/src/lib/security-headers";

export async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const isProd = process.env.NODE_ENV === "production";
  const csp = buildCsp({
    nonce,
    isDev: !isProd,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  });
  // Next (and vinext) read the nonce from the request's CSP header while rendering.
  request.headers.set(CSP_HEADER, csp);
  request.headers.set("x-nonce", nonce);
  const response = await updateSession(request);
  applySecurityHeaders(response, csp, isProd);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|engine/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm|js)$).*)",
  ],
};
