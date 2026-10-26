// SIG-1113: pure course-status transition matrix. No I/O, no Next runtime —
// the server actions in publish.ts call canTransition before every write,
// and the unit test in status.test.ts pins the full matrix.
import type { Role } from "@/src/lib/auth/roles";
import type { CourseStatus } from "./types";

export type TransitionReason = "not_owner" | "invalid_status_change" | "note_required";

export type TransitionCheck = {
  role: Role | null | undefined;
  isOwner: boolean;
  from: CourseStatus;
  to: CourseStatus;
  /** True when a valid (3–500 char, trimmed) review note was supplied. */
  hasNote?: boolean;
};

/**
 * Decides whether a caller may move a course from one status to another.
 *
 * - Admin: any change among the five statuses (rejecting requires a note);
 *   same-status is allowed so republish stays idempotent.
 * - Coach + owner: save (`draft|rejected → draft`) and submit
 *   (`draft|rejected → in_review`) only — never `published`.
 * - Everyone else (student, signed-out, or non-owner): nothing.
 */
export function canTransition(check: TransitionCheck): { ok: true } | { ok: false; reason: TransitionReason } {
  const { role, isOwner, from, to, hasNote } = check;
  if (role === "admin") {
    if (to === "rejected" && !hasNote) {
      return { ok: false, reason: "note_required" };
    }
    return { ok: true };
  }
  if ((role === "coach" || role === "student" || role == null) && !isOwner) {
    return { ok: false, reason: "not_owner" };
  }
  if (role === "coach" && isOwner) {
    if (to === "draft" && (from === "draft" || from === "rejected")) {
      return { ok: true };
    }
    if (to === "in_review" && (from === "draft" || from === "rejected")) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "invalid_status_change" };
}
