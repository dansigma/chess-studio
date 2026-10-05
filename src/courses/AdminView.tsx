"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Trash2, Upload } from "lucide-react";
import { IconButton, Button } from "@/src/studio/ui/Button";
import { chapterTitleFromPgn, variationsFromChapterPgn } from "./chapter-pgn";
import { CourseChrome } from "./CourseChrome";
import { DescriptionField } from "./DescriptionField";
import { moveListItem, normalizeChapters } from "./draft";
import { currentUserCanPublish, publishCourse, removePublishedCourse } from "./publish";
import { findPublishedConflict, isCourseId, isCourseTheme, slugify } from "./catalog";
import {
  clearLocalCustomCourses,
  fetchPublishedCourses,
  readLocalCustomCourses,
  removeLocalCustomDraft,
} from "./store";
import { COURSE_THEMES, type Course, type CourseChapter, type CourseColor, type CourseTheme, type CourseVariation } from "./types";

type CourseDraft = Omit<Course, "theme"> & { theme: CourseTheme | "" };

function emptyCourse(): CourseDraft {
  return {
    id: crypto.randomUUID(),
    slug: "",
    title: "",
    summary: "",
    coverUrl: "",
    videoUrl: "",
    theme: "",
    color: "black",
    chapters: [],
  };
}

export function AdminView() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [draft, setDraft] = useState<CourseDraft>(emptyCourse);
  const [error, setError] = useState("");
  const [localDrafts, setLocalDrafts] = useState<Course[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  useEffect(() => {
    let cancel = false;
    void (async () => {
    if (
      process.env.NODE_ENV === "development" &&
      new URLSearchParams(window.location.search).has("previewDrafts")
    ) {
      setAllowed(true);
      setCourses([
        {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "preview-live",
          title: "Preview live course",
          summary: "",
          theme: "openings",
          color: "white",
          chapters: [],
        },
      ]);
      setLocalDrafts([
        {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "preview-draft-replace",
          title: "Preview draft — replaces",
          summary: "",
          theme: "openings",
          color: "black",
          chapters: [
            { id: "c-1", title: "One", variations: [] },
            { id: "c-2", title: "Two", variations: [] },
          ],
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          slug: "preview-draft-new",
          title: "Preview draft — new",
          summary: "",
          theme: "strategy",
          color: "white",
          chapters: [{ id: "c-3", title: "Only", variations: [] }],
        },
      ]);
      return;
    }
      const allowedToPublish = await currentUserCanPublish();
      if (cancel) {
        return;
      }
      if (!allowedToPublish) {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      const published = await fetchPublishedCourses();
      if (cancel) {
        return;
      }
      if (published.error) {
        setError(published.error);
        setCourses(published.courses);
        return;
      }
      setCourses(published.courses);
      setLocalDrafts(readLocalCustomCourses());
    })();
    return () => {
      cancel = true;
    };
  }, []);

  function refresh(next: Course[]) {
    setCourses(next);
  }

  function updateChapter(chapterId: string, patch: Partial<CourseChapter>) {
    setDraft({
      ...draft,
      chapters: draft.chapters.map((chapter) => (chapter.id === chapterId ? { ...chapter, ...patch } : chapter)),
    });
  }

  function updateVariation(chapterId: string, variationId: string, patch: Partial<CourseVariation>) {
    setDraft({
      ...draft,
      chapters: draft.chapters.map((chapter) =>
        chapter.id === chapterId
          ? {
              ...chapter,
              variations: chapter.variations.map((variation) =>
                variation.id === variationId ? { ...variation, ...patch } : variation,
              ),
            }
          : chapter,
      ),
    });
  }

  function moveChapter(index: number, direction: -1 | 1) {
    setDraft((current) => ({ ...current, chapters: moveListItem(current.chapters, index, direction) }));
  }

  function moveVariation(chapterId: string, index: number, direction: -1 | 1) {
    setDraft((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) =>
        chapter.id === chapterId
          ? { ...chapter, variations: moveListItem(chapter.variations, index, direction) }
          : chapter,
      ),
    }));
  }

  async function addChapterPgn(chapterId: string, file: File) {
    let text = "";
    try {
      text = await file.text();
    } catch {
      setError("That PGN file could not be read.");
      return;
    }
    if (text.length > 1_000_000) {
      setError("That PGN file is too large.");
      return;
    }
    const lines = variationsFromChapterPgn(text);
    if (lines.length === 0) {
      setError("That PGN has no playable lines.");
      return;
    }
    const suggested = chapterTitleFromPgn(text);
    const chapter = draftRef.current.chapters.find((item) => item.id === chapterId);
    if (!chapter) {
      return;
    }
    if (chapter.variations.length + lines.length > 40) {
      setError("A chapter can have at most 40 lines.");
      return;
    }
    setDraft((current) => ({
      ...current,
      chapters: current.chapters.map((item) =>
        item.id === chapterId
          ? {
              ...item,
              title: item.title.trim() || suggested || item.title,
              variations: [...item.variations, ...lines],
            }
          : item,
      ),
    }));
    setError("");
  }

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
  }

  async function importLocalDraft(course: Course) {
    const conflict = findPublishedConflict(course.id, courses);
    if (conflict && !window.confirm(`Replace the published course “${conflict.title}” with this browser draft?`)) {
      return;
    }
    setImportingId(course.id);
    const result = await publishCourse({
      ...course,
      id: isCourseId(course.id) ? course.id : crypto.randomUUID(),
      theme: isCourseTheme(course.theme) ? course.theme : "openings",
    });
    setImportingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCourses((current) => [result.course, ...current.filter((item) => item.id !== result.course.id)]);
    setLocalDrafts((current) => current.filter((item) => item.id !== course.id));
    removeLocalCustomDraft(course.id);
    setError("");
  }

  function discardLocalDrafts() {
    if (!window.confirm("Discard the drafts saved in this browser? This cannot be undone.")) {
      return;
    }
    clearLocalCustomCourses();
    setLocalDrafts([]);
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
        {localDrafts.length > 0 ? (
          <section className="rounded-xl border border-studio-border p-4 lg:col-span-2">
            <h2 className="text-body font-medium text-studio-fg">Drafts saved in this browser</h2>
            <p className="mt-1 text-caption text-studio-muted">
              These courses live only in this browser. Import a draft to publish it for every student. Nothing is
              published automatically.
            </p>
            <ul className="mt-3 space-y-2">
              {localDrafts.map((course, index) => {
                const conflict = findPublishedConflict(course.id, courses);
                const title =
                  typeof course.title === "string" && course.title.trim() ? course.title.trim() : "Untitled course";
                const chapterCount = Array.isArray(course.chapters) ? course.chapters.length : 0;
                return (
                  <li key={`${course.id}-${index}`} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-body text-studio-fg">{title}</span>
                    <span className="text-caption text-studio-muted">
                      {chapterCount === 1 ? "1 chapter" : `${chapterCount} chapters`}
                    </span>
                    {conflict ? (
                      <span className="text-caption text-studio-warning-fg">Replaces “{conflict.title}”</span>
                    ) : null}
                    <Button
                      variant={conflict ? "ghost" : "primary"}
                      disabled={importingId !== null}
                      onClick={() => void importLocalDraft(course)}
                    >
                      {importingId === course.id ? "Importing…" : conflict ? "Replace" : "Import"}
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Button variant="ghost" className="mt-3" disabled={importingId !== null} onClick={discardLocalDrafts}>
              Discard all drafts
            </Button>
          </section>
        ) : null}
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
          <h1 className="text-xl font-semibold text-studio-fg">{draft.title.trim() || "Create a course"}</h1>
          <p className="text-caption text-studio-muted">/courses/{draft.slug.trim() || slugify(draft.title) || "…"}</p>
          <label className="block text-caption text-studio-muted">
            Title
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
            />
          </label>
          <div className="block text-caption text-studio-muted">
            Course description
            <DescriptionField
              key={draft.id}
              value={draft.summary}
              onChange={(summary) => setDraft((current) => ({ ...current, summary }))}
            />
          </div>
          <label className="block text-caption text-studio-muted">
            Cover image
            <input
              value={draft.coverUrl ?? ""}
              onChange={(event) => setDraft({ ...draft, coverUrl: event.target.value })}
              placeholder="https://"
              className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
            />
          </label>
          <label className="block text-caption text-studio-muted">
            Intro video
            <input
              value={draft.videoUrl ?? ""}
              onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })}
              placeholder="YouTube, Vimeo, or an https video file"
              className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
            />
          </label>
          <label className="block text-caption text-studio-muted">
            Theme
            <select
              value={draft.theme}
              onChange={(event) => {
                const theme = event.target.value;
                if (theme === "" || isCourseTheme(theme)) {
                  setDraft({ ...draft, theme });
                }
              }}
              className="mt-1 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
            >
              <option value="">Choose a theme</option>
              {COURSE_THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-caption text-studio-muted">
            Pieces the student plays
            <select
              value={draft.color}
              onChange={(event) => setDraft({ ...draft, color: event.target.value as CourseColor })}
              className="mt-1 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
            >
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>

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
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : "Save course"}
            </Button>
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

function ChapterDraft({
  chapter,
  index,
  total,
  onTitle,
  onMove,
  onRemove,
  onUpload,
  onAddLine,
  onVariationTitle,
  onVariationPgn,
  onMoveVariation,
  onRemoveVariation,
}: {
  chapter: CourseChapter;
  index: number;
  total: number;
  onTitle: (title: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onUpload: (file: File) => void;
  onAddLine: () => void;
  onVariationTitle: (variationId: string, title: string) => void;
  onVariationPgn: (variationId: string, pgn: string) => void;
  onMoveVariation: (index: number, direction: -1 | 1) => void;
  onRemoveVariation: (variationId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section className="rounded-xl border border-studio-border p-4">
      <div className="flex items-start gap-2">
        <label className="min-w-0 flex-1 text-caption text-studio-muted">
          Chapter {index + 1}
          <input
            value={chapter.title}
            onChange={(event) => onTitle(event.target.value)}
            placeholder="Chapter title"
            className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
          />
        </label>
        <div className="mt-5 flex shrink-0 gap-0.5">
          <IconButton label="Move chapter up" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp size={14} />
          </IconButton>
          <IconButton label="Move chapter down" size="sm" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ChevronDown size={14} />
          </IconButton>
          <IconButton label="Remove chapter" size="sm" onClick={onRemove}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {chapter.variations.map((variation, variationIndex) => (
          <div key={variation.id} className="rounded-lg bg-studio-chrome p-3">
            <div className="flex items-center gap-2">
              <input
                value={variation.title}
                onChange={(event) => onVariationTitle(variation.id, event.target.value)}
                placeholder="Line name"
                className="min-w-0 flex-1 rounded-lg border border-studio-border bg-studio-bg px-3 py-2 text-body text-studio-fg"
              />
              <IconButton
                label="Move line up"
                size="sm"
                disabled={variationIndex === 0}
                onClick={() => onMoveVariation(variationIndex, -1)}
              >
                <ChevronUp size={14} />
              </IconButton>
              <IconButton
                label="Move line down"
                size="sm"
                disabled={variationIndex === chapter.variations.length - 1}
                onClick={() => onMoveVariation(variationIndex, 1)}
              >
                <ChevronDown size={14} />
              </IconButton>
              <IconButton label="Remove line" size="sm" onClick={() => onRemoveVariation(variation.id)}>
                <Trash2 size={14} />
              </IconButton>
            </div>
            <textarea
              value={variation.pgn}
              onChange={(event) => onVariationPgn(variation.id, event.target.value)}
              rows={5}
              placeholder="{Opening comment} 1. e4 e5 {Why this move.}"
              className="mt-2 w-full rounded-lg border border-studio-border bg-studio-bg px-3 py-2 font-mono text-dense text-studio-fg"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onAddLine}>
          Add line
        </Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          <Upload size={14} />
          Upload PGN
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".pgn,.txt,text/plain"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              onUpload(file);
            }
          }}
        />
      </div>
      <p className="mt-2 text-caption text-studio-faint">
        A commented PGN for this chapter. Each game in the file becomes a line.
      </p>
    </section>
  );
}
