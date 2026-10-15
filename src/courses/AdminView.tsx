"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
      setError("The course needs a title.");
      return;
    }
    const theme = draft.theme;
    if (!isCourseTheme(theme)) {
      setError("Choose a course theme.");
      return;
    }
    const normalized = normalizeChapters(draft.chapters);
    if ("error" in normalized) {
      setError(normalized.error);
      return;
    }
    if (!hasPlayableContent(normalized.chapters)) {
      setError("Add at least one chapter with a playable line before publishing.");
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
    setError("");
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
          <h1 className="text-xl font-semibold text-studio-fg">Administrators only</h1>
          <p className="mt-3 text-body text-studio-muted">
            Sign in with an administrator account to create courses. Student accounts can study
            courses, and only an administrator can open this page.
          </p>
          <Button className="mt-6" onClick={() => router.push("/login?next=/courses/admin")}>
            Sign in
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
              setError("");
            }}
          >
            New course
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
                if (hasLines && !window.confirm("Remove this chapter?")) {
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
            Add chapter
          </Button>

          <p className="text-caption text-studio-muted">
            Save the title and description first. Chapters can be named, reordered, and filled in afterwards.
          </p>
          {error ? <p className="text-body text-studio-warning-fg">{error}</p> : null}
          {courses.some((course) => course.id === draft.id) ? (
            <p className="text-caption text-studio-muted">
              {draft.publishedAt != null ? "Published — visible to every student." : "Unpublished draft — only you can preview it."}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : "Save course"}
            </Button>
            {courses.some((course) => course.id === draft.id) && draft.publishedAt != null ? (
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  if (!window.confirm("Unpublish this course? Students will no longer see it.")) {
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
                    setError("");
                    router.refresh();
                  });
                }}
              >
                Unpublish
              </Button>
            ) : null}
            {courses.some((course) => course.id === draft.id) ? (
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  if (!window.confirm("Delete this course for every student?")) {
                    return;
                  }
                  void removePublishedCourse(draft.id).then((result) => {
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    refresh(courses.filter((course) => course.id !== draft.id));
                    setDraft(emptyCourse());
                    setError("");
                  });
                }}
              >
                Delete
              </Button>
            ) : null}
          </div>
        </form>
      </main>
    </div>
  );
}
