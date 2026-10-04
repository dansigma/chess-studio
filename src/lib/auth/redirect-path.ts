const ALLOWED_PREFIXES = ["/studio", "/courses", "/login/update-password"];

export function safeAuthNext(value: unknown, fallback = "/studio"): string {
  if (typeof value !== "string") return fallback;
  if (value.includes("//") || value.includes("\\") || value.includes("..")) return fallback;
  return ALLOWED_PREFIXES.some(
    (p) => value === p || value.startsWith(`${p}/`) || value.startsWith(`${p}?`),
  )
    ? value
    : fallback;
}
