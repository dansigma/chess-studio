const ALLOWED_PREFIXES = ["/studio", "/courses", "/login/update-password", "/admin"];
const PROBE_ORIGIN = "http://auth-probe.invalid";

export function safeAuthNext(value: unknown, fallback = "/studio"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (value.includes("\\")) return fallback;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  const path = url.pathname;
  // The parser leaves %2F encoded (it is a path delimiter); a downstream
  // server or proxy may decode it once more, so fail closed on escapes that
  // could still become traversal-significant (dot, slash, backslash, null).
  if (/%(?:2e|2f|5c|00)/i.test(path)) return fallback;
  if (!ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  return `${path}${url.search}`;
}
