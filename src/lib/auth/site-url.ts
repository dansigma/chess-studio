export interface SiteUrlOptions {
  siteUrl?: string | null;
  origin?: string | null;
  nodeEnv?: string;
}

export type SiteUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string; cause: string };

function normalizeUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return null;
  }
}

/**
 * Resolves the base site URL for auth email redirects (password reset, signup confirmation).
 *
 * In production:
 * - NEXT_PUBLIC_SITE_URL is strictly required.
 * - Must be a well-formed URL with the "https:" protocol.
 * - Never falls back to request Origin or localhost.
 *
 * In non-production (development, test):
 * - Uses NEXT_PUBLIC_SITE_URL if configured.
 * - Falls back to the request Origin header if present.
 * - Falls back to "http://localhost:3000" if neither is present.
 */
export function resolveSiteUrl(options: SiteUrlOptions = {}): SiteUrlResult {
  const nodeEnv = options.nodeEnv !== undefined ? options.nodeEnv : process.env.NODE_ENV;
  const isProduction = nodeEnv === "production";
  const configured =
    options.siteUrl !== undefined ? options.siteUrl : process.env.NEXT_PUBLIC_SITE_URL;

  if (isProduction) {
    if (!configured || !configured.trim()) {
      return {
        ok: false,
        error: "Authentication service is temporarily unavailable.",
        cause: "NEXT_PUBLIC_SITE_URL is required in production but was not set.",
      };
    }

    let parsed: URL;
    try {
      parsed = new URL(configured.trim());
    } catch {
      return {
        ok: false,
        error: "Authentication service is temporarily unavailable.",
        cause: `NEXT_PUBLIC_SITE_URL is not a valid URL: ${configured}`,
      };
    }

    if (parsed.protocol !== "https:") {
      return {
        ok: false,
        error: "Authentication service is temporarily unavailable.",
        cause: `NEXT_PUBLIC_SITE_URL must use https: in production (received ${parsed.protocol}).`,
      };
    }

    const normalized = normalizeUrl(configured);
    if (!normalized) {
      return {
        ok: false,
        error: "Authentication service is temporarily unavailable.",
        cause: `NEXT_PUBLIC_SITE_URL could not be normalized: ${configured}`,
      };
    }

    return {
      ok: true,
      url: normalized,
    };
  }

  // Non-production (development, test)
  if (configured && configured.trim()) {
    const normalized = normalizeUrl(configured);
    if (normalized) {
      return { ok: true, url: normalized };
    }
  }

  if (options.origin && options.origin.trim()) {
    const normalized = normalizeUrl(options.origin);
    if (normalized) {
      return { ok: true, url: normalized };
    }
  }

  return {
    ok: true,
    url: "http://localhost:3000",
  };
}
