// SIG-1115: admin review queue for submitted courses. Lists `in_review`
// submissions (title, author, submitted date) with Preview (dedicated
// admin route), Approve (`approveCourse`) and Reject (dialog with a required
// 3–500 note via `rejectCourse`). A row disappears only after the action
// succeeds; on a server error the row stays and the error is shown, so the
// admin can retry.
// SIG-1174: note validation maps to its own code (shared with rules.ts),
// so the dialog renders the note message instead of the not-found one.
// SIG-1175: `approve-failed`/`reject-failed` clear `pending` without marking
// the row decided; the queue also renders as stacked cards below `md:` so
// the actions stay usable at 390px.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { approveCourse, rejectCourse } from "@/src/courses/publish";
import type { SiteLocale } from "@/src/i18n/locale";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { Dialog } from "@/src/studio/ui/Dialog";
import { Panel } from "@/src/studio/ui/Panel";
import type { ReviewQueueRowData } from "@/app/admin/courses/actions";
import { emptyReviewQueueState, isReviewNoteValid, reviewQueueState } from "./review-queue";
import { courseAdminErrorToReviewCode, reviewQueueErrorKey } from "./rules";
import type { ReviewQueueCode } from "@/app/admin/courses/actions";
import { tAdminUsers } from "./strings";

const ERROR_ALERT_CLASS =
  "rounded-lg border border-studio-danger/30 bg-studio-danger/10 px-3 py-2 text-dense text-studio-danger";
const PREVIEW_LINK_CLASS =
  "inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-dense font-medium text-studio-muted hover:bg-studio-hover hover:text-studio-fg";

function ReviewRowActions({
  id,
  locale,
  pending,
  onApprove,
  onReject,
}: {
  id: string;
  locale: SiteLocale;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <Link href={`/admin/courses/${id}/preview`} className={PREVIEW_LINK_CLASS}>
        {tAdminUsers(locale, "admin.review.preview")}
      </Link>
      <Button type="button" variant="primary" size="sm" disabled={pending} onClick={onApprove}>
        {pending ? tAdminUsers(locale, "admin.review.approving") : tAdminUsers(locale, "admin.review.approve")}
      </Button>
      <Button type="button" variant="danger" size="sm" disabled={pending} onClick={onReject}>
        {tAdminUsers(locale, "admin.review.reject")}
      </Button>
    </>
  );
}

export function CourseReviewQueue({
  initialRows,
  onRemainingChange,
}: {
  initialRows: ReviewQueueRowData[];
  /** Called with the number of undecided rows whenever it changes (keeps the header badge live). */
  onRemainingChange?: (remaining: number) => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [view, setView] = useState(emptyReviewQueueState());
  const [actionError, setActionError] = useState<ReviewQueueCode | null>(null);

  const visible = initialRows.filter((row) => !view.decided.has(row.id));
  const remaining = visible.length;
  useEffect(() => {
    onRemainingChange?.(remaining);
  }, [remaining, onRemainingChange]);

  // A stale approve/reject error must not follow the admin into a freshly
  // opened (or reopened) reject dialog.
  function openReject(id: string) {
    setActionError(null);
    setView((current) => reviewQueueState(current, { type: "reject-open", id }));
  }

  function closeReject() {
    setActionError(null);
    setView((current) => reviewQueueState(current, { type: "reject-close" }));
  }

  async function approve(id: string) {
    setView((current) => reviewQueueState(current, { type: "approve-start", id }));
    setActionError(null);
    const result = await approveCourse(id);
    if (!result.ok) {
      setView((current) => reviewQueueState(current, { type: "approve-failed", id }));
      setActionError(courseAdminErrorToReviewCode(result.error));
      return;
    }
    setView((current) => reviewQueueState(current, { type: "approve-done", id }));
  }

  async function reject() {
    const target = view.rejecting;
    if (!target) {
      return;
    }
    if (!isReviewNoteValid(target.note)) {
      setActionError("invalid_note");
      return;
    }
    setView((current) => reviewQueueState(current, { type: "approve-start", id: target.id }));
    setActionError(null);
    const result = await rejectCourse(target.id, target.note.trim());
    if (!result.ok) {
      setView((current) => reviewQueueState(current, { type: "reject-failed", id: target.id }));
      setActionError(courseAdminErrorToReviewCode(result.error));
      return;
    }
    setView((current) => reviewQueueState(current, { type: "reject-done", id: target.id }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-studio-fg">
          {tAdminUsers(locale, "admin.review.heading")}
        </h1>
        <p className="mt-1 text-body text-studio-muted">{tAdminUsers(locale, "admin.review.intro")}</p>
      </div>
      {actionError && !view.rejecting ? (
        <p role="alert" className={ERROR_ALERT_CLASS}>
          {tAdminUsers(locale, reviewQueueErrorKey(actionError))}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <Panel className="border border-studio-border p-6 text-body text-studio-muted">
          {tAdminUsers(locale, "admin.review.empty")}
        </Panel>
      ) : (
        <>
          <Panel className="hidden overflow-hidden border border-studio-border md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-body">
                <thead>
                  <tr className="border-b border-studio-border text-caption text-studio-muted">
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                      {tAdminUsers(locale, "admin.review.table.title")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                      {tAdminUsers(locale, "admin.review.table.author")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                      {tAdminUsers(locale, "admin.review.table.submitted")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                      <span className="sr-only">{tAdminUsers(locale, "admin.review.table.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-studio-border">
                  {visible.map((row) => {
                    const pending = view.pending.has(row.id);
                    return (
                      <tr key={row.id} className="hover:bg-studio-hover-subtle">
                        <td className="px-4 py-3 font-medium text-studio-fg">{row.title}</td>
                        <td className="px-4 py-3 text-studio-muted">{row.authorName ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-studio-muted">
                          {row.submittedAt}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <ReviewRowActions
                              id={row.id}
                              locale={locale}
                              pending={pending}
                              onApprove={() => void approve(row.id)}
                              onReject={() => openReject(row.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
          <ul className="space-y-3 md:hidden">
            {visible.map((row) => {
              const pending = view.pending.has(row.id);
              return (
                <Panel as="li" key={row.id} data-review-card={row.id} className="border border-studio-border p-4">
                  <p className="text-body font-medium text-studio-fg">{row.title}</p>
                  <p className="mt-1 text-dense text-studio-muted">
                    {row.authorName ?? "—"} · {row.submittedAt}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ReviewRowActions
                      id={row.id}
                      locale={locale}
                      pending={pending}
                      onApprove={() => void approve(row.id)}
                      onReject={() => openReject(row.id)}
                    />
                  </div>
                </Panel>
              );
            })}
          </ul>
        </>
      )}
      {view.rejecting ? (
        <Dialog
          title={tAdminUsers(locale, "admin.review.dialog.title", {
            title: initialRows.find((row) => row.id === view.rejecting!.id)?.title ?? "",
          })}
          onClose={closeReject}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={view.pending.has(view.rejecting.id)}
                onClick={closeReject}
              >
                {tAdminUsers(locale, "admin.review.dialog.cancel")}
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={view.pending.has(view.rejecting.id)}
                onClick={() => void reject()}
              >
                {tAdminUsers(locale, "admin.review.dialog.confirm")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="block text-caption font-medium text-studio-muted">
              {tAdminUsers(locale, "admin.review.dialog.noteLabel")}
              <textarea
                rows={4}
                value={view.rejecting.note}
                onChange={(event) =>
                  setView((current) => reviewQueueState(current, { type: "reject-note", note: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-studio-border-strong bg-studio-chrome px-3 py-2 text-body text-studio-fg outline-none placeholder:text-studio-faint focus:border-studio-accent"
              />
            </label>
            <p className="text-caption text-studio-faint">{tAdminUsers(locale, "admin.review.dialog.noteHint")}</p>
            {actionError ? (
              <p role="alert" className={ERROR_ALERT_CLASS}>
                {tAdminUsers(locale, reviewQueueErrorKey(actionError))}
              </p>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
