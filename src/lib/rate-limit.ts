const MAX_KEYS = 5000;

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
    if (windows.size >= MAX_KEYS) {
      const oldest = windows.keys().next();
      if (!oldest.done) {
        windows.delete(oldest.value);
      }
    }
  }

  return {
    check(key: string): Verdict {
      const now = clock();
      if (windows.size >= MAX_KEYS) {
        prune(now);
      }
      const entry = windows.get(key);
      if (!entry || now - entry.windowStart >= options.windowMs) {
        windows.set(key, { count: 1, windowStart: now });
        return { ok: true };
      }
      if (entry.count < options.limit) {
        entry.count += 1;
        return { ok: true };
      }
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.windowStart + options.windowMs - now) / 1000),
      );
      return { ok: false, retryAfterSeconds };
    },
  };
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  return "unknown";
}
