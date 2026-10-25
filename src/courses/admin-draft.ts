import { chapterTitleFromPgn, variationsFromChapterPgn } from "./chapter-pgn";
import type { CourseAdminMessage } from "@/src/i18n/course-admin-strings";
import type { Course, CourseChapter, CourseTheme, CourseVariation } from "./types";

/** The editable shape of a course in the admin form: theme may still be unset. */
export type CourseDraft = Omit<Course, "theme"> & { theme: CourseTheme | "" };

export function emptyCourse(): CourseDraft {
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
    status: "draft",
    accessTier: "free",
    priceCents: null,
  };
}

const MAX_PGN_CHARS = 1_000_000;
const MAX_CHAPTER_LINES = 40;

export type ChapterPgnUpdate = { lines: CourseVariation[]; suggested: string };

/**
 * Validates an uploaded PGN for one chapter: size, playable lines, and the
 * per-chapter line cap. Returns the lines to append plus the suggested title,
 * `{ error }` for a rejected file, or `null` when the chapter is gone.
 */
export function importChapterPgn(
  text: string,
  chapters: CourseChapter[],
  chapterId: string,
): ChapterPgnUpdate | { error: CourseAdminMessage } | null {
  if (text.length > MAX_PGN_CHARS) {
    return { error: { key: "course.admin.error.pgnTooLarge" } };
  }
  const lines = variationsFromChapterPgn(text);
  if (lines.length === 0) {
    return { error: { key: "course.admin.error.pgnNoLines" } };
  }
  const chapter = chapters.find((item) => item.id === chapterId);
  if (!chapter) {
    return null;
  }
  if (chapter.variations.length + lines.length > MAX_CHAPTER_LINES) {
    return { error: { key: "course.admin.error.tooManyLines" } };
  }
  return { lines, suggested: chapterTitleFromPgn(text) };
}

/** Appends an import's lines to a chapter, adopting the suggested title when the chapter has none. */
export function appendChapterPgn(
  chapters: CourseChapter[],
  chapterId: string,
  update: ChapterPgnUpdate,
): CourseChapter[] {
  return chapters.map((item) =>
    item.id === chapterId
      ? {
          ...item,
          title: item.title.trim() || update.suggested || item.title,
          variations: [...item.variations, ...update.lines],
        }
      : item,
  );
}
