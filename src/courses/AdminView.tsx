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
import { isCourseId, isCourseTheme, slugify } from "./catalog";
import { clearLocalCustomCourses, fetchPublishedCourses, readLocalCustomCourses } from "./store";
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

  const [saving, setSaving] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    let cancel = false;
    void (async () => {
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
      const local = readLocalCustomCourses();
      const uploaded: Course[] = [];
      const failures: string[] = [];
      for (const course of local) {
        const result = await publishCourse({
          ...course,
          id: isCourseId(course.id) ? course.id : crypto.randomUUID(),
          theme: isCourseTheme(course.theme) ? course.theme : "openings",
        });
        if (result.ok) {
          uploaded.push(result.course);
        } else {
          failures.push(result.error);
        }
      }
      if (local.length > 0 && failures.length === 0) {
        clearLocalCustomCourses();
      }
      const seen = new Set(uploaded.map((course) => course.id));
      setCourses([...uploaded, ...published.courses.filter((course) => !seen.has(course.id))]);
      if (failures.length > 0) {
        setError(failures[0] ?? "");
      }
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
    if (!isCourseTheme(draft.theme)) {
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
