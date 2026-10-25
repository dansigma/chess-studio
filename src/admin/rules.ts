// SIG-1063: pure decision helpers for the /admin/users screen. Kept in a
// `"use client"`-free module so node:test can cover the acceptance rules
// without mounting React: own-row disable, error-code localization coverage,
// and reason-length validation (mirrors the 3–500 server rule).
import type { AdminUsersCode } from "@/app/admin/users/actions.ts";
import type { AdminUsersStringKey } from "./strings.ts";

export const ADMIN_USERS_ERROR_CODES: readonly AdminUsersCode[] = [
  "invalid_role",
  "invalid_reason",
  "not_found",
  "own_role",
  "unchanged",
  "last_admin",
  "unavailable",
  "forbidden",
  "rate_limited",
  "invalid_page",
];

export function adminUsersErrorKey(code: AdminUsersCode): AdminUsersStringKey {
  return `admin.users.error.${code}`;
}

/** The signed-in admin's own row never offers a role change. */
export function canChangeRole(rowUserId: string, currentUserId: string): boolean {
  return rowUserId !== currentUserId;
}

/** Client-side mirror of the server reason rule (trimmed, 3–500 chars). */
export function isReasonValid(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= 3 && trimmed.length <= 500;
}

/** The Admin nav link renders for admins only (fail-closed on null). */
export function shouldShowAdminLink(isAdmin: boolean): boolean {
  return isAdmin;
}
