import { safeAuthNext } from "./redirect-path";

/**
 * Where Supabase sends the browser after the OAuth provider (Google) approves the sign-in.
 * `next` is re-validated with safeAuthNext so an external or non-allowlisted target falls back
 * to /studio; it is then URL-encoded because it is itself a query value of the callback URL.
 * Must match a redirect URL allowed in the Supabase dashboard (`/auth/callback**`).
 */
export function oauthRedirectTo(origin: string, next: unknown): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(safeAuthNext(next))}`;
}
