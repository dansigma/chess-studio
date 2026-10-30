// SIG-1063: pure decision helpers for the /admin/users screen. Kept in a
// `"use client"`-free module so node:test can cover the acceptance rules
// without mounting React: own-row disable, error-code localization coverage,
// and reason-length validation (mirrors the 3–500 server rule).
import type { AdminUsersCode } from "@/app/admin/users/actions.ts";
import type { InviteActionCode } from "@/app/admin/users/invite-actions.ts";
import type { ReviewQueueCode } from "@/app/admin/courses/actions.ts";
import type { CourseAdminMessage } from "../i18n/course-admin-strings.ts";
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

export type CoachInviteAcceptCode =
  | "accepted"
  | "invalid"
  | "not_found"
  | "expired"
  | "revoked"
  | "consumed"
  | "email_mismatch"
  | "role_unchanged";

export type CoachInviteResultCode = CoachInviteAcceptCode | "unavailable" | "rate_limited";

export const COACH_INVITE_ACCEPT_CODES: readonly CoachInviteAcceptCode[] = [
  "accepted",
  "invalid",
  "not_found",
  "expired",
  "revoked",
  "consumed",
  "email_mismatch",
  "role_unchanged",
];

export type InviteActionErrorCode = "invalid_email" | "not_found" | "unavailable" | "forbidden" | "rate_limited";

export const INVITE_ACTION_ERROR_CODES: readonly InviteActionErrorCode[] = [
  "invalid_email",
  "not_found",
  "unavailable",
  "forbidden",
  "rate_limited",
] satisfies readonly InviteActionCode[];

export function inviteActionErrorKey(code: InviteActionErrorCode): AdminUsersStringKey {
  return `admin.invites.error.${code}`;
}

/** An invite row is pending when it is neither used, revoked, nor expired. */
export function isInvitePending(row: { acceptedAt: string | null; revokedAt: string | null; expiresAt: string }): boolean {
  if (row.acceptedAt !== null || row.revokedAt !== null) {
    return false;
  }
  return Date.parse(row.expiresAt) > Date.now();
}

export function coachInviteAcceptKey(code: CoachInviteResultCode): AdminUsersStringKey {
  if (code === "accepted") {
    return "coach.invite.success";
  }
  return `coach.invite.error.${code}`;
}

export function adminUsersErrorKey(code: AdminUsersCode): AdminUsersStringKey {
  return `admin.users.error.${code}`;
}

export const REVIEW_QUEUE_ERROR_CODES: readonly ReviewQueueCode[] = [
  "invalid_id",
  "invalid_note",
  "unavailable",
  "forbidden",
] satisfies readonly ReviewQueueCode[];

/** Maps a review-queue action code to its localized message key. */
export function reviewQueueErrorKey(code: ReviewQueueCode): AdminUsersStringKey {
  switch (code) {
    case "invalid_id":
      return "admin.review.error.invalidId";
    case "invalid_note":
      return "admin.review.error.invalidNote";
    case "unavailable":
      return "admin.review.error.unavailable";
    case "forbidden":
      return "admin.review.error.forbidden";
  }
}

/**
 * SIG-1174: maps a course-admin server failure to the review-queue code the
 * dialog renders. Note validation has its own code; a missing row
 * (`publishFailed` from the pre-write read) or a no-longer-reviewable course
 * (`invalid_status_change`) reads as not-found.
 */
export function courseAdminErrorToReviewCode(message: CourseAdminMessage): ReviewQueueCode {
  switch (message.key) {
    case "course.admin.error.invalidId":
      return "invalid_id";
    case "course.admin.error.note_required":
      return "invalid_note";
    case "course.admin.error.publishFailed":
      return "invalid_id";
    case "course.admin.error.invalid_status_change":
      return "invalid_id";
    case "course.admin.error.serverUnavailable":
      return "unavailable";
    default:
      return "unavailable";
  }
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
