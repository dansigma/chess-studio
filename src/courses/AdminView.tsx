"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { Dialog } from "@/src/studio/ui/Dialog";
import { ChapterDraft } from "./ChapterDraft";
import { CourseChrome } from "./CourseChrome";
import { AdminTabPanel, AdminTabs } from "./AdminTabs";
import { CourseDescriptionField, CourseInfoFields, CourseMediaFields } from "./CourseFields";
import { CourseView } from "./CourseView";
import { FieldAnchor, focusField } from "./FieldError";
import { isDraftDirty } from "./dirty";
import { COURSE_ADMIN_TABS, locateError, validateCourseDraft, type CourseAdminTab, type LocatedError } from "./validate-draft";
import { LocalDraftsSection } from "./LocalDraftsSection";
import { emptyCourse, type CourseDraft } from "./admin-draft";
import { visibleActions } from "./author-actions";
import { isCourseTheme, slugify } from "./catalog";
import { normalizeChapters } from "./draft";
import {
  publishCourse,
  removePublishedCourse,
  saveCourseDraft,
  submitCourseForReview,
  unpublishCourse,
} from "./publish";
import { useAdminDraft } from "./use-admin-draft";
import { useAdminSession } from "./use-admin-session";
import type { CourseAdminMessage } from "@/src/i18n/course-admin-strings";
import type { Course, CourseStatus } from "./types";

const STATUS_BADGE_KEY = {
  draft: "course.admin.statusBadge.draft",
  in_review: "course.admin.statusBadge.inReview",
  published: "course.admin.statusBadge.published",
  rejected: "course.admin.statusBadge.rejected",
  archived: "course.admin.statusBadge.archived",
} as const satisfies Record<CourseStatus, Parameters<typeof tCourseAdmin>[1]>;

const TAB_LABEL_KEY = {
  info: "course.admin.tab.info",
  description: "course.admin.tab.description",
  media: "course.admin.tab.media",
  chapters: "course.admin.tab.chapters",
  preview: "course.admin.tab.preview",
} as const satisfies Record<CourseAdminTab, Parameters<typeof tCourseAdmin>[1]>;

const STATUS_NOTICE_KEY = {
  draft: "course.admin.status.draft",
  in_review: "course.admin.status.inReview",
  published: "course.admin.status.published",
  rejected: "course.admin.status.rejected",
  archived: "course.admin.status.archived",
} as const satisfies Record<CourseStatus, Parameters<typeof tCourseAdmin>[1]>;

export function AdminView() {
  const router = useRouter();
  const locale = useStudioStore((state) => state.settings.locale);
  const {
    allowed,
    role,
    courses,
    setCourses,
    localDrafts,
    error,
    setError,
    importingId,
    importLocalDraft,
    discardLocalDrafts,
    refresh,
  } = useAdminSession();
  const { draft, setDraft, updateChapter, updateVariation, moveChapter, moveVariation, addChapterPgn } =
    useAdminDraft(setError);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<CourseAdminTab>("info");
  // SIG-1363: the error that belongs to one field, shown next to it with its
  // tab marked. Errors without a field use the general slot below the tabs.
  const [fieldError, setFieldError] = useState<LocatedError | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ field: LocatedError["field"]; tab: CourseAdminTab; n: number } | null>(null);
  const handledFocus = useRef(0);
  // Last saved (or freshly opened) copy of the draft: the dirty baseline.
  const [snapshot, setSnapshot] = useState<CourseDraft>(draft);
  const [pendingDiscard, setPendingDiscard] = useState<{ run: () => void } | null>(null);
  const dirty = isDraftDirty(draft, snapshot);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Focus only after the target tab's panel has committed, once per request.
  useEffect(() => {
    if (!focusRequest || focusRequest.n === handledFocus.current || focusRequest.tab !== tab) {
      return;
    }
    handledFocus.current = focusRequest.n;
    focusField(focusRequest.field);
  }, [tab, focusRequest]);

  /** Shows an error next to its field (switching tab and focusing it), or in the general slot. */
  function reportError(message: CourseAdminMessage) {
    const located = locateError(message);
    if (!located) {
      setFieldError(null);
      setError(message);
      return;
    }
    setError(null);
    setFieldError(located);
    setTab(located.tab);
    setFocusRequest((current) => ({ field: located.field, tab: located.tab, n: (current?.n ?? 0) + 1 }));
  }

  /** Every committed replacement of the draft (load, new, save, submit, unpublish) goes through here. */
  function commitBaseline(next: CourseDraft) {
    setDraft(next);
    setSnapshot(next);
  }

  function loadDraft(next: CourseDraft) {
    commitBaseline(next);
    setError(null);
    setFieldError(null);
    setTab("info");
  }

  /** Runs `action` now, or after the author agrees to discard unsaved changes. */
  function guardUnsaved(action: () => void) {
    if (dirty) {
      setPendingDiscard({ run: action });
      return;
    }
    action();
  }

  const previewCourse = useMemo<Course | null>(() => {
    if (!isCourseTheme(draft.theme)) {
      return null;
    }
    const { theme, ...rest } = draft;
    const title = draft.title.trim();
    return {
      ...rest,
      theme,
      title,
      slug: draft.slug.trim() || slugify(title),
      accessTier: "free",
      priceCents: null,
      // builtin: the preview must not record an enrollment for an unsaved course.
      builtin: true,
      contentLoaded: true,
    };
  }, [draft]);

  const actions = visibleActions({ role, status: draft.status });
  // Admins keep the exact current behavior; coaches are read-only in_review.
  const isAdmin = role !== "coach";
  const readOnly = !isAdmin && draft.status === "in_review";
  const reviewNote =
    draft.status === "rejected" && typeof draft.reviewNote === "string" && draft.reviewNote.trim()
      ? draft.reviewNote.trim()
      : null;
  const draftListed = courses.some((course) => course.id === draft.id);

  function validatedPayload(): { ok: true; payload: Course } | { ok: false } {
    setFieldError(null);
    const check = validateCourseDraft(draft);
    if (!check.ok) {
      reportError(check.error);
      return { ok: false };
    }
    const title = draft.title.trim();
    const normalized = normalizeChapters(draft.chapters);
    if (!isCourseTheme(draft.theme) || "error" in normalized) {
      return { ok: false };
    }
    const theme = draft.theme;
    const authorName = draft.authorName?.trim() ? draft.authorName.trim() : undefined;
    // Narrow the draft's ""|theme union now that isCourseTheme passed.
    const { theme: _unset, ...rest } = draft;
    void _unset;
    const payload: Course = {
      ...rest,
      title,
      slug: draft.slug.trim() || slugify(title),
      summary: draft.summary,
      theme,
      chapters: normalized.chapters,
      // SIG-1363: the site is free; the editor has no tier or price inputs.
      accessTier: "free",
      priceCents: null,
      authorName,
    };
    return { ok: true, payload };
  }

  async function saveDraft() {
    const validated = validatedPayload();
    if (!validated.ok) {
      return;
    }
    setSaving(true);
    try {
      // Admins keep the exact current behavior (publish); coaches save a draft.
      const result = isAdmin ? await publishCourse(validated.payload) : await saveCourseDraft(validated.payload);
      if (!result.ok) {
        reportError(result.error);
        return;
      }
      setCourses((current) => [result.course, ...current.filter((course) => course.id !== result.course.id)]);
      commitBaseline(result.course);
      setError(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function submitForReview() {
    // Save-then-submit on the same validated payload: submit must send what
    // is on screen, not the stale row already in the database. This also
    // covers brand-new unsaved courses (save creates the row first).
    const validated = validatedPayload();
    if (!validated.ok) {
      return;
    }
    setSubmitting(true);
    try {
      const saved = isAdmin ? await publishCourse(validated.payload) : await saveCourseDraft(validated.payload);
      if (!saved.ok) {
        reportError(saved.error);
        return;
      }
      // Saved: the editor now matches the database even if the submit fails.
      commitBaseline(saved.course);
      const result = await submitCourseForReview(saved.course.id);
      if (!result.ok) {
        reportError(result.error);
        return;
      }
      const next: Course = { ...saved.course, status: "in_review" as const };
      setCourses((current) => [next, ...current.filter((course) => course.id !== next.id)]);
      commitBaseline(next);
      setError(null);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (allowed === null) {
    return <div className="min-h-full bg-studio-bg" />;
  }
  if (!allowed) {
    return (
      <div className="min-h-full bg-studio-bg">
        <CourseChrome />
        <main className="mx-auto max-w-lg px-6 py-12">
          <h1 className="text-xl font-semibold text-studio-fg">
            {tCourseAdmin(locale, "course.admin.gated.heading")}
          </h1>
          <p className="mt-3 text-body text-studio-muted">
            {tCourseAdmin(locale, "course.admin.gated.body")}
          </p>
          <Button className="mt-6" onClick={() => router.push("/login?next=/courses/admin")}>
            {tCourseAdmin(locale, "course.admin.gated.signin")}
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome admin />
      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <LocalDraftsSection
          localDrafts={localDrafts}
          courses={courses}
          importingId={importingId}
          onImport={(course) =>
            // SIG-1363: an imported draft opens in the editor through the same
            // guarded load as any other course, so draft, baseline and list agree.
            void importLocalDraft(course)
              .then((saved) => {
                if (saved) {
                  guardUnsaved(() => loadDraft(saved));
                }
              })
              .catch(() => reportError({ key: "course.admin.error.publishFailed" }))
          }
          onDiscard={discardLocalDrafts}
        />
        <aside>
          <Button
            onClick={() => guardUnsaved(() => loadDraft(emptyCourse()))}
          >
            {tCourseAdmin(locale, "course.admin.newCourse")}
          </Button>
          <ul className="mt-4 space-y-1">
            {courses.map((course) => (
              <li key={course.id}>
                <button
                  type="button"
                  className="w-full truncate rounded-md px-2 py-1.5 text-left text-body text-studio-fg hover:bg-studio-hover"
                  onClick={() => guardUnsaved(() => loadDraft(course))}
                >
                  <span className="block truncate">{course.title}</span>
                  <span className="mt-0.5 inline-block rounded-full border border-studio-border px-2 py-px text-caption text-studio-muted">
                    {tCourseAdmin(locale, STATUS_BADGE_KEY[course.status])}
                    {course.status === "rejected" && course.reviewNote ? " • !" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (readOnly) {
              return;
            }
            void saveDraft();
          }}
        >
          <h1 className="text-xl font-semibold text-studio-fg">
            {draft.title.trim() || tCourseAdmin(locale, "course.admin.createHeading")}
          </h1>
          <p className="text-caption text-studio-muted">/courses/{draft.slug.trim() || slugify(draft.title) || "…"}</p>

          {draft.status === "in_review" ? (
            <p className="rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-muted">
              {tCourseAdmin(locale, "course.admin.inReviewNotice")}
            </p>
          ) : null}
          {reviewNote ? (
            <section
              aria-label={tCourseAdmin(locale, "course.admin.reviewNote.heading")}
              className="rounded-lg border border-studio-warning-fg/40 bg-studio-chrome px-4 py-3"
            >
              <h2 className="text-body font-semibold text-studio-fg">
                {tCourseAdmin(locale, "course.admin.reviewNote.heading")}
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-body text-studio-fg">{reviewNote}</p>
            </section>
          ) : null}

          <AdminTabs
            tabs={COURSE_ADMIN_TABS.map((id) => ({
              id,
              label: tCourseAdmin(locale, TAB_LABEL_KEY[id]),
              hasError: fieldError?.tab === id,
            }))}
            active={tab}
            onChange={setTab}
            label={tCourseAdmin(locale, "course.admin.tabs.label")}
            errorLabel={tCourseAdmin(locale, "course.admin.tab.hasError")}
          />
          <AdminTabPanel id={tab}>
            {tab === "info" ? (
              <CourseInfoFields draft={draft} setDraft={setDraft} readOnly={readOnly} error={fieldError} />
            ) : null}
            {tab === "description" ? (
              <CourseDescriptionField draft={draft} setDraft={setDraft} readOnly={readOnly} error={fieldError} />
            ) : null}
            {tab === "media" ? (
              <CourseMediaFields draft={draft} setDraft={setDraft} readOnly={readOnly} error={fieldError} />
            ) : null}
            {tab === "chapters" ? (
              <>
                <FieldAnchor field="chapters" error={fieldError} locale={locale} />
              {!readOnly &&
                draft.chapters.map((chapter, chapterIndex) => (
                  <ChapterDraft
                    key={chapter.id}
                    chapter={chapter}
                    index={chapterIndex}
                    total={draft.chapters.length}
                    error={fieldError}
                    onTitle={(title) => updateChapter(chapter.id, { title })}
                    onVideo={(videoUrl) => updateChapter(chapter.id, { videoUrl })}
                    onMove={(direction) => moveChapter(chapterIndex, direction)}
                    onRemove={() => {
                      const hasLines = chapter.variations.some(
                        (variation) => variation.pgn.trim() || variation.title.trim(),
                      );
                      if (hasLines && !window.confirm(tCourseAdmin(locale, "course.admin.confirm.removeChapter"))) {
                        return;
                      }
                      setDraft((current) => ({
                        ...current,
                        chapters: current.chapters.filter((item) => item.id !== chapter.id),
                      }));
                    }}
                    onUpload={(file) => void addChapterPgn(chapter.id, file)}
                    onAddLine={() =>
                      updateChapter(chapter.id, {
                        variations: [...chapter.variations, { id: crypto.randomUUID(), title: "", pgn: "" }],
                      })
                    }
                    onVariationTitle={(variationId, title) => updateVariation(chapter.id, variationId, { title })}
                    onVariationPgn={(variationId, pgn) => updateVariation(chapter.id, variationId, { pgn })}
                    onMoveVariation={(variationIndex, direction) => moveVariation(chapter.id, variationIndex, direction)}
                    onRemoveVariation={(variationId) =>
                      updateChapter(chapter.id, {
                        variations: chapter.variations.filter((variation) => variation.id !== variationId),
                      })
                    }
                  />
                ))}

              {!readOnly ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      chapters: [...draft.chapters, { id: crypto.randomUUID(), title: "", variations: [] }],
                    })
                  }
                >
                  {tCourseAdmin(locale, "course.admin.addChapter")}
                </Button>
              ) : null}

              </>
            ) : null}
            {tab === "preview" ? (
              previewCourse ? (
                <div
                  className="max-h-[70vh] overflow-auto rounded-xl border border-studio-border"
                  // The preview shows unsaved lessons that have no page yet: keep links inert.
                  onClickCapture={(event) => {
                    if ((event.target as HTMLElement).closest("a")) {
                      event.preventDefault();
                    }
                  }}
                >
                  <CourseView course={previewCourse} />
                </div>
              ) : (
                <p className="text-body text-studio-muted">{tCourseAdmin(locale, "course.admin.preview.needsTheme")}</p>
              )
            ) : null}
          </AdminTabPanel>

          <p className="text-caption text-studio-muted">{tCourseAdmin(locale, "course.admin.saveHint")}</p>
          {error ? (
            <p className="text-body text-studio-warning-fg">{tCourseAdmin(locale, error.key, error.vars)}</p>
          ) : null}
          {draftListed ? (
            <p className="text-caption text-studio-muted">{tCourseAdmin(locale, STATUS_NOTICE_KEY[draft.status])}</p>
          ) : null}
          <div className="flex gap-2">
            {isAdmin ? (
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? tCourseAdmin(locale, "course.admin.saving") : tCourseAdmin(locale, "course.admin.saveCourse")}
              </Button>
            ) : (
              <>
                {actions.saveDraft ? (
                  <Button type="submit" variant="primary" disabled={saving || readOnly}>
                    {saving
                      ? tCourseAdmin(locale, "course.admin.saving")
                      : tCourseAdmin(locale, "course.admin.saveDraft")}
                  </Button>
                ) : null}
                {actions.submitForReview ? (
                  <Button variant="secondary" disabled={saving || submitting} onClick={() => void submitForReview()}>
                    {submitting
                      ? tCourseAdmin(locale, "course.admin.submitting")
                      : tCourseAdmin(locale, "course.admin.submitReview")}
                  </Button>
                ) : null}
              </>
            )}
            {actions.unpublish ? (
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  if (!window.confirm(tCourseAdmin(locale, "course.admin.confirm.unpublish"))) {
                    return;
                  }
                  setSaving(true);
                  void unpublishCourse(draft.id).then((result) => {
                    setSaving(false);
                    if (!result.ok) {
                      reportError(result.error);
                      return;
                    }
                    setCourses((current) =>
                      current.map((course) =>
                        course.id === draft.id ? { ...course, status: "draft" as const, publishedAt: null } : course,
                      ),
                    );
                    setDraft((current) => ({ ...current, status: "draft" as const, publishedAt: null }));
                    setSnapshot((current) => ({ ...current, status: "draft" as const, publishedAt: null }));
                    setError(null);
                    router.refresh();
                  });
                }}
              >
                {tCourseAdmin(locale, "course.admin.unpublish")}
              </Button>
            ) : null}
            {draftListed && (isAdmin || actions.delete) ? (
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  if (!window.confirm(tCourseAdmin(locale, "course.admin.confirm.delete"))) {
                    return;
                  }
                  void removePublishedCourse(draft.id).then((result) => {
                    if (!result.ok) {
                      reportError(result.error);
                      return;
                    }
                    refresh(courses.filter((course) => course.id !== draft.id));
                    loadDraft(emptyCourse());
                  });
                }}
              >
                {tCourseAdmin(locale, "course.admin.delete")}
              </Button>
            ) : null}
          </div>
        </form>
      </main>
      {pendingDiscard ? (
        <Dialog
          title={tCourseAdmin(locale, "course.admin.discard.title")}
          onClose={() => setPendingDiscard(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPendingDiscard(null)}>
                {tCourseAdmin(locale, "course.admin.discard.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const { run } = pendingDiscard;
                  setPendingDiscard(null);
                  run();
                }}
              >
                {tCourseAdmin(locale, "course.admin.discard.confirm")}
              </Button>
            </>
          }
        >
          {tCourseAdmin(locale, "course.admin.discard.body")}
        </Dialog>
      ) : null}
    </div>
  );
}
