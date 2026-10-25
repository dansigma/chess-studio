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
import { isCourseTheme, slugify } from "./catalog";
import { hasPlayableContent, normalizeChapters } from "./draft";
import { publishCourse, removePublishedCourse, unpublishCourse } from "./publish";
import { useAdminDraft } from "./use-admin-draft";
import { useAdminSession } from "./use-admin-session";

export function AdminView() {
  const router = useRouter();
  const locale = useStudioStore((state) => state.settings.locale);
  const {
    allowed,
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

  async function save() {
    const title = draft.title.trim();
    if (!title) {
      setError({ key: "course.admin.error.needsTitle" });
      return;
    }
    const theme = draft.theme;
    if (!isCourseTheme(theme)) {
      setError({ key: "course.admin.error.chooseTheme" });
      return;
    }
    const normalized = normalizeChapters(draft.chapters);
    if ("error" in normalized) {
      setError(normalized.error);
      return;
    }
    if (!hasPlayableContent(normalized.chapters)) {
      setError({ key: "course.admin.error.needsPlayableLine" });
      return;
    }
    setSaving(true);
    const result = await publishCourse({
      ...draft,
      title,
      slug: draft.slug.trim() || slugify(title),
      summary: draft.summary,
      theme,
      chapters: normalized.chapters,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCourses((current) => [result.course, ...current.filter((course) => course.id !== result.course.id)]);
    setDraft(result.course);
    setError(null);
    router.refresh();
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
              setDraft(emptyCourse());
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
                  {course.title}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <CourseFields draft={draft} setDraft={setDraft} />

          {draft.chapters.map((chapter, chapterIndex) => (
            <ChapterDraft
              key={chapter.id}
              chapter={chapter}
              index={chapterIndex}
              total={draft.chapters.length}
              onTitle={(title) => updateChapter(chapter.id, { title })}
              onMove={(direction) => moveChapter(chapterIndex, direction)}
              onRemove={() => {
                const hasLines = chapter.variations.some((variation) => variation.pgn.trim() || variation.title.trim());
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

          <p className="text-caption text-studio-muted">{tCourseAdmin(locale, "course.admin.saveHint")}</p>
          {error ? (
            <p className="text-body text-studio-warning-fg">{tCourseAdmin(locale, error.key, error.vars)}</p>
          ) : null}
          {courses.some((course) => course.id === draft.id) ? (
            <p className="text-caption text-studio-muted">
              {draft.publishedAt != null
                ? tCourseAdmin(locale, "course.admin.status.published")
                : tCourseAdmin(locale, "course.admin.status.draft")}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving
                ? tCourseAdmin(locale, "course.admin.saving")
                : tCourseAdmin(locale, "course.admin.saveCourse")}
            </Button>
            {courses.some((course) => course.id === draft.id) && draft.publishedAt != null ? (
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
                      current.map((course) => (course.id === draft.id ? { ...course, publishedAt: null } : course)),
                    );
                    setDraft((current) => ({ ...current, publishedAt: null }));
                    setError(null);
                    router.refresh();
                  });
                }}
              >
                {tCourseAdmin(locale, "course.admin.unpublish")}
              </Button>
            ) : null}
            {courses.some((course) => course.id === draft.id) ? (
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
                    setDraft(emptyCourse());
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
