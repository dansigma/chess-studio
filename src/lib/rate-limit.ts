// Rate limiting is best-effort with two tiers: on Cloudflare Workers the
// native Rate Limit binding (`env[bindingName]`) enforces the limit at the
// edge (per Cloudflare location — eventually consistent, replacing
// per-isolate-only); everywhere else (local dev, tests, Next build) it
// degrades to the in-process fallback below (per isolate/process).
//
// Trust boundary: `cf-connecting-ip` is set (overwritten) by Cloudflare at
// the edge and trusted first. `x-forwarded-for` / `x-real-ip` must come from
// a single appending proxy at the edge that strips/overwrites the inbound
// values and appends the real client IP
// (`X-Forwarded-For: <spoofed-by-client>, <client>`), so the client IP is the
// RIGHT-most entry (the one the trusted hop appended). The LEFT-most entry is
// attacker-controlled under an appending proxy and must not be used. Without
// that proxy the header is client-controlled (dev only).
//
// No-header case: when no IP header is present, call sites MUST still count
// the request against a shared low-quota `unknown` bucket for that limiter —
// never skip. Skipping lets anyone bypass every limit by omitting headers.
// `clientIp` returns "unknown" and `rateLimitKey` maps it to a shared
// `<route>:unknown` key so all header-less callers share one small quota.
export const MAX_KEYS = 5000;

export type Verdict = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Structural type for the workerd Rate Limit binding runtime API. */
export type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

/** Resolves env[BINDING] without a static workerd import (keeps node --test working). */
async function resolveBinding(
  bindingName: string,
): Promise<RateLimitBinding | undefined> {
  try {
    const workers = (await import(
      /* webpackIgnore: true */ "cloudflare:workers"
    )) as { env?: Record<string, unknown> };
    const candidate = workers?.env?.[bindingName];
    if (
      candidate &&
      typeof (candidate as RateLimitBinding).limit === "function"
    ) {
      return candidate as RateLimitBinding;
    }
  } catch {
    // No workerd runtime (node --test, Next build stub) — fall through to memory.
  }
  return undefined;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): {
  check(key: string): Verdict;
} {
  const clock = options.now ?? Date.now;
  const windows = new Map<string, { count: number; windowStart: number }>();

  function prune(now: number): void {
    for (const [key, entry] of windows) {
      if (now - entry.windowStart >= options.windowMs) {
        windows.delete(key);
      }
    }
    while (windows.size >= MAX_KEYS) {
      let oldestKey: string | undefined;
      let oldestStart = Number.POSITIVE_INFINITY;
      for (const [key, entry] of windows) {
        if (entry.windowStart < oldestStart) {
          oldestStart = entry.windowStart;
          oldestKey = key;
        }
      }
      if (oldestKey === undefined) {
        break;
      }
      windows.delete(oldestKey);
    }
  }

  return {
    check(key: string): Verdict {
      const now = clock();
      const entry = windows.get(key);
      if (entry && now - entry.windowStart < options.windowMs) {
        if (entry.count < options.limit) {
          entry.count += 1;
          windows.delete(key);
          windows.set(key, entry);
          return { ok: true };
        }
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((entry.windowStart + options.windowMs - now) / 1000),
        );
        return { ok: false, retryAfterSeconds };
      }
      if (entry) {
        windows.delete(key);
      } else if (windows.size >= MAX_KEYS) {
        prune(now);
      }
      windows.set(key, { count: 1, windowStart: now });
      return { ok: true };
    },
  };
}

let warnedUnknownIp = false;
let warnedFallback = false;

function warnFallbackOnce(bindingName: string, reason: string): void {
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn(
      `rate-limit: binding ${bindingName} unavailable (${reason}), using in-memory fallback`,
    );
  }
}

/**
 * Builds the limiter key for a route + client IP. Unknown IPs (no headers)
 * share one `<route>:unknown` bucket so omitting headers never bypasses the
 * limit — call sites must always check, never skip on "unknown".
 */
export function rateLimitKey(route: string, ip: string): string {
  return `${route}:${ip}`;
}

export function clientIp(headers: Headers): string {
  // Cloudflare overwrites this at the edge — trusted first.
  const connectingIp = headers.get("cf-connecting-ip")?.trim();
  if (connectingIp) {
    return connectingIp;
  }
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const last = parts.at(-1);
    if (last) {
      return last;
    }
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  if (!warnedUnknownIp) {
    warnedUnknownIp = true;
    console.warn("rate-limit: client IP unavailable (counted in shared unknown bucket)");
  }
  return "unknown";
}

/**
 * Async limiter: prefers the native Cloudflare Rate Limit binding
 * (`env[bindingName]`, edge-enforced per Cloudflare location) and always
 * enforces the in-process `createRateLimiter` fallback too. Both must allow
 * the request: the fallback preserves long windows the native API cannot
 * express (periods are 10s|60s only, e.g. the 10 req/10 min auth quota),
 * while the binding adds an edge burst cap. The native API returns only
 * `{ success }` (no retry-after), so binding denials use
 * `bindingRetryAfterSeconds` (defaults to min(window, 60s)).
 */
export function createRouteLimiter(options: {
  limit: number;
  windowMs: number;
  bindingName: string;
  now?: () => number;
  /** Retry hint for native binding denials (its period is 10s|60s). */
  bindingRetryAfterSeconds?: number;
  /** Test seam — overrides the workerd binding resolution. */
  resolveBindingForTest?: () => Promise<RateLimitBinding | undefined>;
}): {
  checkAsync(key: string): Promise<Verdict>;
} {
  const fallback = createRateLimiter({
    limit: options.limit,
    windowMs: options.windowMs,
    now: options.now,
  });
  const fallbackRetryCeil = Math.max(1, Math.ceil(options.windowMs / 1000));
  const bindingRetryAfterSeconds =
    options.bindingRetryAfterSeconds ?? Math.min(fallbackRetryCeil, 60);
  return {
    async checkAsync(key: string): Promise<Verdict> {
      // Always count against the fallback first so long windows (e.g. auth
      // 10-min) hold even when the edge binding allows the burst.
      const fallbackVerdict = fallback.check(key);
      const resolve = options.resolveBindingForTest ?? (() => resolveBinding(options.bindingName));
      let binding: RateLimitBinding | undefined;
      try {
        binding = await resolve();
      } catch {
        binding = undefined;
      }
      if (binding) {
        try {
          const result = await binding.limit({ key });
          if (!result.success) {
            return { ok: false, retryAfterSeconds: bindingRetryAfterSeconds };
          }
          return fallbackVerdict;
        } catch {
          warnFallbackOnce(options.bindingName, "limit() threw");
          return fallbackVerdict;
        }
      } else {
        warnFallbackOnce(options.bindingName, "missing");
      }
      return fallbackVerdict;
    },
  };
}
