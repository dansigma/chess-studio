"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { ChapterDraft } from "./ChapterDraft";
import { CourseChrome } from "./CourseChrome";
import { CourseFields } from "./CourseFields";
import { LocalDraftsSection } from "./LocalDraftsSection";
import { emptyCourse } from "./admin-draft";
import { centsToPrice, priceToCents, validateTierAndPrice, visibleActions } from "./author-actions";
import { isCourseTheme, slugify } from "./catalog";
import { hasPlayableContent, normalizeChapters } from "./draft";
import {
  publishCourse,
  removePublishedCourse,
  saveCourseDraft,
  submitCourseForReview,
  unpublishCourse,
} from "./publish";
import { useAdminDraft } from "./use-admin-draft";
import { useAdminSession } from "./use-admin-session";
import type { Course, CourseStatus } from "./types";

const STATUS_BADGE_KEY = {
  draft: "course.admin.statusBadge.draft",
  in_review: "course.admin.statusBadge.inReview",
  published: "course.admin.statusBadge.published",
  rejected: "course.admin.statusBadge.rejected",
  archived: "course.admin.statusBadge.archived",
} as const satisfies Record<CourseStatus, Parameters<typeof tCourseAdmin>[1]>;

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
  // Raw reais text for the paid price field. Keyed by draft id so switching
  // courses resets the input; undefined = derive from priceCents lazily.
  const [priceTexts, setPriceTexts] = useState<Record<string, string>>({});
  const priceText =
    priceTexts[draft.id] ?? (draft.priceCents != null ? centsToPrice(draft.priceCents, locale) : "");

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
    const title = draft.title.trim();
    if (!title) {
      setError({ key: "course.admin.error.needsTitle" });
      return { ok: false };
    }
    if (!isCourseTheme(draft.theme)) {
      setError({ key: "course.admin.error.chooseTheme" });
      return { ok: false };
    }
    const theme = draft.theme;
    const normalized = normalizeChapters(draft.chapters);
    if ("error" in normalized) {
      setError(normalized.error);
      return { ok: false };
    }
    if (!hasPlayableContent(normalized.chapters)) {
      setError({ key: "course.admin.error.needsPlayableLine" });
      return { ok: false };
    }
    // Prefer the raw text the author typed (it may differ from the synced
    // priceCents when the text is currently invalid).
    const tier = draft.accessTier;
    const raw = tier === "paid" ? (priceText ?? (draft.priceCents != null ? centsToPrice(draft.priceCents, locale) : "")) : "";
    const priceCents = tier === "paid" ? priceToCents(raw) : null;
    if (tier === "paid" && priceCents === null) {
      setError({ key: "course.admin.error.invalidPrice" });
      return { ok: false };
    }
    const tierCheck = validateTierAndPrice(tier, priceCents);
    if (!tierCheck.ok) {
      setError({ key: tierCheck.error });
      return { ok: false };
    }
    const authorName = draft.authorName?.trim() ? draft.authorName.trim() : undefined;
    if (authorName && authorName.length > 120) {
      setError({ key: "course.admin.error.authorNameTooLong" });
      return { ok: false };
    }
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
      accessTier: tier,
      priceCents,
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
        setError(result.error);
        return;
      }
      setCourses((current) => [result.course, ...current.filter((course) => course.id !== result.course.id)]);
      setDraft(result.course);
      setPriceTexts((current) => ({
        ...current,
        [result.course.id]: result.course.priceCents != null ? centsToPrice(result.course.priceCents, locale) : "",
      }));
      setError(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function submitForReview() {
    const theme = draft.theme;
    if (!isCourseTheme(theme)) {
      setError({ key: "course.admin.error.chooseTheme" });
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitCourseForReview(draft.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const next: Course = { ...draft, status: "in_review" as const, theme };
      setCourses((current) => current.map((course) => (course.id === draft.id ? next : course)));
      setDraft(next);
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
          onImport={(course) => void importLocalDraft(course)}
          onDiscard={discardLocalDrafts}
        />
        <aside>
          <Button
            onClick={() => {
              const next = emptyCourse();
              setDraft(next);
              setPriceTexts((current) => ({ ...current, [next.id]: "" }));
              setError(null);
            }}
          >
            {tCourseAdmin(locale, "course.admin.newCourse")}
          </Button>
          <ul className="mt-4 space-y-1">
            {courses.map((course) => (
              <li key={course.id}>
                <button
                  type="button"
                  className="w-full truncate rounded-md px-2 py-1.5 text-left text-body text-studio-fg hover:bg-studio-hover"
                  onClick={() => setDraft(course)}
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
          <CourseFields
            draft={draft}
            setDraft={setDraft}
            readOnly={readOnly}
            priceText={priceText}
            setPriceText={(text) => setPriceTexts((current) => ({ ...current, [draft.id]: text }))}
          />

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

          {!readOnly &&
            draft.chapters.map((chapter, chapterIndex) => (
              <ChapterDraft
                key={chapter.id}
                chapter={chapter}
                index={chapterIndex}
                total={draft.chapters.length}
                onTitle={(title) => updateChapter(chapter.id, { title })}
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
                      setError(result.error);
                      return;
                    }
                    setCourses((current) =>
                      current.map((course) =>
                        course.id === draft.id ? { ...course, status: "draft" as const, publishedAt: null } : course,
                      ),
                    );
                    setDraft((current) => ({ ...current, status: "draft" as const, publishedAt: null }));
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
                      setError(result.error);
                      return;
                    }
                    refresh(courses.filter((course) => course.id !== draft.id));
                    const next = emptyCourse();
                    setDraft(next);
                    setPriceTexts((current) => ({ ...current, [next.id]: "" }));
                    setError(null);
                  });
                }}
              >
                {tCourseAdmin(locale, "course.admin.delete")}
              </Button>
            ) : null}
          </div>
        </form>
      </main>
    </div>
  );
}
