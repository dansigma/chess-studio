// Rate limiting is best-effort and in-process (per Node process, not global).
// Deployments with multiple instances or serverless replicas enforce the
// limit independently per instance.
//
// Trust boundary: `x-forwarded-for` / `x-real-ip` are client-supplied unless
// a trusted front proxy strips/overwrites inbound values and appends the real
// client IP. This deployment assumes a single trusted proxy using the append
// convention (`X-Forwarded-For: <client>, <proxy>`), so the client IP is the
// RIGHT-most entry (the one the trusted hop appended). The LEFT-most entry is
// attacker-controlled under an appending proxy and must not be used.
// Configure the edge proxy to strip inbound `X-Forwarded-For`/`X-Real-IP` and
// overwrite them; the app must not be directly reachable without that proxy
// if per-IP enforcement matters.
//
// No-header case: when neither header is present the client cannot be
// attributed to an IP. Callers treat `"unknown"` as unattributed and skip
// rate limiting (fail-open) rather than collapsing every such client into one
// shared bucket, where a single loud client would 429 all the others. Without
// a header-setting proxy, header-based limiting is bypassable by sending a
// header, so the proxy above is required for real enforcement.
export const MAX_KEYS = 5000;

type Verdict = { ok: true } | { ok: false; retryAfterSeconds: number };

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

export function clientIp(headers: Headers): string {
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
  return "unknown";
}
