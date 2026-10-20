/**
 * Security headers for HTML/API responses, applied from `proxy.ts` so they work under both
 * pipelines (`next start` and vinext/Workers). Static assets are served without going through
 * the proxy (see `public/_headers`).
 *
 * The CSP ships as Report-Only first. To enforce it, change CSP_HEADER to
 * "Content-Security-Policy" (one line); `frame-ancestors` is ignored in Report-Only, which is
 * why X-Frame-Options: DENY is always sent enforcing.
 */

export const CSP_HEADER = "Content-Security-Policy-Report-Only";

/** Third-party hosts the browser talks to directly (everything else goes via /api/* proxies). */
export const COURSE_IMAGE_HOSTS = ["https://images.unsplash.com"] as const;
export const PIECE_IMAGE_HOSTS = ["https://cdn.jsdelivr.net"] as const;
export const VIDEO_EMBED_HOSTS = ["https://www.youtube-nocookie.com", "https://player.vimeo.com"] as const;

function origin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export type CspOptions = {
  isDev?: boolean;
  supabaseUrl?: string;
};

export function buildCsp({ isDev = false, supabaseUrl }: CspOptions = {}): string {
  const supabase = origin(supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const list = (...parts: Array<string | null | readonly string[]>) =>
    parts.flatMap((p) => (p === null ? [] : typeof p === "string" ? [p] : [...p]));

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    // No nonce: a nonce needs every page rendered per request, which would drop the ISR cache on the
    // course pages. 'unsafe-inline' covers Next's inline bootstrap/flight scripts and LANG_BOOTSTRAP;
    // 'wasm-unsafe-eval' is for Stockfish WASM. Moving to a nonce or hashes is a separate decision.
    ["script-src", list("'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", isDev ? "'unsafe-eval'" : null)],
    // React/Tailwind inline style attributes need 'unsafe-inline'.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", list("'self'", "blob:", "data:", COURSE_IMAGE_HOSTS, PIECE_IMAGE_HOSTS, supabase)],
    ["font-src", ["'self'", "data:"]],
    // html-to-image re-fetches piece SVGs (CDN) when exporting the board.
    ["connect-src", list("'self'", PIECE_IMAGE_HOSTS, supabase, supabaseWs, isDev ? ["ws:", "http:"] : null)],
    ["media-src", ["'self'", "blob:", "https:"]],
    ["frame-src", [...VIDEO_EMBED_HOSTS]],
    ["worker-src", ["'self'", "blob:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

/** Headers that are the same on every response. */
export function staticSecurityHeaders(isProd: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
  };
  if (isProd) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

export function applySecurityHeaders(response: Response, csp: string, isProd: boolean): void {
  for (const [key, value] of Object.entries(staticSecurityHeaders(isProd))) {
    response.headers.set(key, value);
  }
  response.headers.set(CSP_HEADER, csp);
}
