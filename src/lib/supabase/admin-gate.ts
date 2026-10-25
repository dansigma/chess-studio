/**
 * Whether `path` is protected by the admin gate (`/courses/admin` or under it).
 * Shared by the gate decision and the `updateSession` early return so the two
 * cannot drift apart. Matches on an exact path segment: `/courses/adminx`
 * is NOT a gate path.
 */
export function isAdminGatePath(path: string): boolean {
  return path === "/courses/admin" || path.startsWith("/courses/admin/");
}

/**
 * Pure admin-gate decision for `/courses/admin*`.
 * Returns the redirect destination (pathname + optional search) or null
 * when the request may proceed. Without Supabase the login page is
 * unusable, so unconfigured admin traffic goes straight to `/courses`.
 */
export function adminDenyDestination(
  path: string,
  options: { configured: boolean; hasUser: boolean; canAuthor: boolean },
): string | null {
  if (!isAdminGatePath(path)) {
    return null;
  }
  if (!options.configured) {
    return "/courses";
  }
  if (!options.hasUser) {
    return `/login?next=${encodeURIComponent(path)}`;
  }
  if (!options.canAuthor) {
    return "/courses";
  }
  return null;
}
