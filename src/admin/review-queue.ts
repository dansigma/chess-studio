// SIG-1115: pure queue view-state for the admin course-review screen. No
// React, no I/O — CourseReviewQueue calls approveCourse/rejectCourse from
// publish.ts directly; this module tracks per-row pending state, the reject
// dialog, and the 3–500 trimmed note rule (same bounds as rejectCourse).
import type { CourseAccessTier } from "@/src/courses/types";

/** One row of the review queue, as loaded by the list action. */
export type ReviewQueueRow = {
  id: string;
  title: string;
  authorName: string | null;
  tier: CourseAccessTier;
  priceCents: number | null;
  submittedAt: string;
};

export type ReviewQueueState = {
  /** Row ids with an approve/reject write in flight. */
  pending: ReadonlySet<string>;
  /** Row under rejection (dialog open) with its draft note, if any. */
  rejecting: { id: string; note: string } | null;
  /** Rows already decided this session (approved or rejected). */
  decided: ReadonlySet<string>;
};

export function emptyReviewQueueState(): ReviewQueueState {
  return { pending: new Set(), rejecting: null, decided: new Set() };
}

export type ReviewQueueEvent =
  | { type: "approve-start"; id: string }
  | { type: "approve-done"; id: string }
  | { type: "approve-failed"; id: string }
  | { type: "reject-open"; id: string }
  | { type: "reject-note"; note: string }
  | { type: "reject-close" }
  | { type: "reject-done"; id: string }
  | { type: "reject-failed"; id: string };

function without(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

function withId(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  next.add(id);
  return next;
}

/** Pure reducer: transitions for the review-queue view state. Unit-tested. */
export function reviewQueueState(state: ReviewQueueState, event: ReviewQueueEvent): ReviewQueueState {
  switch (event.type) {
    case "approve-start":
      if (state.decided.has(event.id) || state.pending.has(event.id)) {
        return state;
      }
      return { ...state, pending: withId(state.pending, event.id) };
    case "approve-done":
      return { ...state, pending: without(state.pending, event.id), decided: withId(state.decided, event.id) };
    case "approve-failed":
      return { ...state, pending: without(state.pending, event.id) };
    case "reject-open":
      if (state.decided.has(event.id) || state.pending.has(event.id)) {
        return state;
      }
      return { ...state, rejecting: { id: event.id, note: "" } };
    case "reject-note":
      if (!state.rejecting) {
        return state;
      }
      return { ...state, rejecting: { ...state.rejecting, note: event.note } };
    case "reject-close":
      return { ...state, rejecting: null };
    case "reject-done":
      if (!state.rejecting || state.rejecting.id !== event.id) {
        return state;
      }
      return {
        pending: without(state.pending, event.id),
        rejecting: null,
        decided: withId(state.decided, event.id),
      };
    case "reject-failed":
      if (!state.rejecting || state.rejecting.id !== event.id) {
        return state;
      }
      return { ...state, pending: without(state.pending, event.id) };
  }
}

/** Client-side mirror of the server note rule (trimmed, 3–500 chars). */
export function isReviewNoteValid(note: string): boolean {
  const trimmed = note.trim();
  return trimmed.length >= 3 && trimmed.length <= 500;
}
