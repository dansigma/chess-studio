// SIG-1115: admin review queue for submitted courses. Lists `in_review`
// submissions (title, author, tier, submitted date) with Preview (dedicated
// admin route), Approve (`approveCourse`) and Reject (dialog with a required
// 3–500 note via `rejectCourse`). After either action the row disappears.
"use client";

import { useState } from "react";
import Link from "next/link";
import { approveCourse, rejectCourse } from "@/src/courses/publish";
import { tierLabel } from "@/src/courses/tier-label";
import type { CourseAdminMessage } from "@/src/i18n/course-admin-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Dialog } from "@/src/studio/ui/Dialog";
import type { ReviewQueueRowData } from "@/app/admin/courses/actions";
import { emptyReviewQueueState, isReviewNoteValid, reviewQueueState } from "./review-queue";
import { reviewQueueErrorKey } from "./rules";
import type { ReviewQueueCode } from "@/app/admin/courses/actions";
import { tAdminUsers } from "./strings";

function errorMessage(message: CourseAdminMessage): ReviewQueueCode {
  switch (message.key) {
    case "course.admin.error.invalidId":
      return "invalid_id";
    case "course.admin.error.serverUnavailable":
      return "unavailable";
    default:
      return "unavailable";
  }
}

export function CourseReviewQueue({ initialRows }: { initialRows: ReviewQueueRowData[] }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [view, setView] = useState(emptyReviewQueueState());
  const [actionError, setActionError] = useState<ReviewQueueCode | null>(null);

  const visible = initialRows.filter((row) => !view.decided.has(row.id));

  async function approve(id: string) {
    setView((current) => reviewQueueState(current, { type: "approve-start", id }));
    setActionError(null);
    const result = await approveCourse(id);
    setView((current) => reviewQueueState(current, { type: "approve-done", id }));
    if (!result.ok) {
      setActionError(errorMessage(result.error));
    }
  }

  async function reject() {
    const target = view.rejecting;
    if (!target) {
      return;
    }
    if (!isReviewNoteValid(target.note)) {
      setActionError("invalid_id");
      return;
    }
    setView((current) => reviewQueueState(current, { type: "approve-start", id: target.id }));
    setActionError(null);
    const result = await rejectCourse(target.id, target.note.trim());
    if (!result.ok) {
      setView((current) => reviewQueueState(current, { type: "approve-done", id: target.id }));
      setActionError(errorMessage(result.error));
      return;
    }
    setView((current) => reviewQueueState(current, { type: "reject-done", id: target.id }));
  }

  return (
    <div>
      <h1>{tAdminUsers(locale, "admin.review.heading")}</h1>
      <p>{tAdminUsers(locale, "admin.review.intro")}</p>
      {actionError ? <p role="alert">{tAdminUsers(locale, reviewQueueErrorKey(actionError))}</p> : null}
      {visible.length === 0 ? (
        <p>{tAdminUsers(locale, "admin.review.empty")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{tAdminUsers(locale, "admin.review.table.title")}</th>
              <th>{tAdminUsers(locale, "admin.review.table.author")}</th>
              <th>{tAdminUsers(locale, "admin.review.table.tier")}</th>
              <th>{tAdminUsers(locale, "admin.review.table.submitted")}</th>
              <th>
                <span className="sr-only">{tAdminUsers(locale, "admin.review.table.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const pending = view.pending.has(row.id);
              return (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{row.authorName ?? "—"}</td>
                  <td>{tierLabel(row.tier, row.priceCents, locale)}</td>
                  <td>{row.submittedAt}</td>
                  <td>
                    <Link href={`/admin/courses/${row.id}/preview`}>{tAdminUsers(locale, "admin.review.preview")}</Link>{" "}
                    <button type="button" disabled={pending} onClick={() => void approve(row.id)}>
                      {pending
                        ? tAdminUsers(locale, "admin.review.approving")
                        : tAdminUsers(locale, "admin.review.approve")}
                    </button>{" "}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setView((current) => reviewQueueState(current, { type: "reject-open", id: row.id }))}
                    >
                      {tAdminUsers(locale, "admin.review.reject")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {view.rejecting ? (
        <Dialog
          title={tAdminUsers(locale, "admin.review.dialog.title", {
            title: visible.find((row) => row.id === view.rejecting!.id)?.title ?? "",
          })}
          onClose={() => setView((current) => reviewQueueState(current, { type: "reject-close" }))}
        >
          <label>
            {tAdminUsers(locale, "admin.review.dialog.noteLabel")}
            <textarea
              value={view.rejecting.note}
              onChange={(event) => setView((current) => reviewQueueState(current, { type: "reject-note", note: event.target.value }))}
            />
          </label>
          <p>{tAdminUsers(locale, "admin.review.dialog.noteHint")}</p>
          <div>
            <button type="button" disabled={view.pending.has(view.rejecting.id)} onClick={() => void reject()}>
              {tAdminUsers(locale, "admin.review.dialog.confirm")}
            </button>
            <button
              type="button"
              disabled={view.pending.has(view.rejecting.id)}
              onClick={() => setView((current) => reviewQueueState(current, { type: "reject-close" }))}
            >
              {tAdminUsers(locale, "admin.review.dialog.cancel")}
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
