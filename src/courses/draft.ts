import { importPgn } from "@/src/chess/pgn";
import type { CourseAdminMessage } from "@/src/i18n/course-admin-strings";
import { courseVideo } from "./media";
import type { CourseChapter, CourseVariation } from "./types";

/** SIG-1350: the chapter description cap, enforced by the editor and by normalizeChapters. */
export const MAX_CHAPTER_DESCRIPTION_LENGTH = 2000;

/** True when at least one chapter holds at least one playable line. */
export function hasPlayableContent(chapters: CourseChapter[]): boolean {
  return chapters.some((chapter) => chapter.variations.length > 0);
}

export function moveListItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction;
  if (next < 0 || next >= items.length) {
    return items;
  }
  const copy = [...items];
  const [item] = copy.splice(index, 1);
  if (!item) {
    return items;
  }
  copy.splice(next, 0, item);
  return copy;
}

/** SIG-1366: drag-and-drop reorder; the item ends at `to` after the move. */
export function moveListItemTo<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return items;
  }
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  if (!item) {
    return items;
  }
  copy.splice(to, 0, item);
  return copy;
}

/** SIG-1366: copies a chapter right after the source, with fresh ids for it and every line. */
export function duplicateChapter(chapters: CourseChapter[], chapterId: string): CourseChapter[] {
  const index = chapters.findIndex((chapter) => chapter.id === chapterId);
  const source = chapters[index];
  if (!source) {
    return chapters;
  }
  const copy: CourseChapter = {
    ...source,
    id: crypto.randomUUID(),
    variations: source.variations.map((variation) => ({ ...variation, id: crypto.randomUUID() })),
  };
  const next = [...chapters];
  next.splice(index + 1, 0, copy);
  return next;
}

/** SIG-1366: copies a line right after the source, with a fresh id. */
export function duplicateVariation(chapter: CourseChapter, variationId: string): CourseChapter {
  const index = chapter.variations.findIndex((variation) => variation.id === variationId);
  const source = chapter.variations[index];
  if (!source) {
    return chapter;
  }
  const copy: CourseVariation = { ...source, id: crypto.randomUUID() };
  const variations = [...chapter.variations];
  variations.splice(index + 1, 0, copy);
  return { ...chapter, variations };
}

export function normalizeChapters(
  chapters: CourseChapter[],
): { chapters: CourseChapter[] } | { error: CourseAdminMessage } {
  if (chapters.length > 40) {
    return { error: { key: "course.admin.error.tooManyChapters" } };
  }
  const next: CourseChapter[] = [];
  for (const chapter of chapters) {
    const title = chapter.title.trim().slice(0, 120);
    const variations: CourseVariation[] = [];
    for (const variation of chapter.variations) {
      const lineTitle = variation.title.trim().slice(0, 120);
      const pgn = variation.pgn.trim();
      if (!lineTitle && !pgn) {
        continue;
      }
      if (!pgn) {
        return { error: { key: "course.admin.error.lineNeedsPgn", vars: { title: lineTitle || "untitled" } } };
      }
      if (pgn.length > 20000) {
        return { error: { key: "course.admin.error.lineTooLong", vars: { title: lineTitle || "untitled" } } };
      }
      if (importPgn(pgn).tree.children.length === 0) {
        return { error: { key: "course.admin.error.lineNoMoves", vars: { title: lineTitle || "untitled" } } };
      }
      variations.push({ id: variation.id, title: lineTitle, pgn });
    }
    if (variations.length > 40) {
      return { error: { key: "course.admin.error.tooManyLines" } };
    }
    const videoUrl = chapter.videoUrl?.trim() ?? "";
    if (videoUrl && !courseVideo(videoUrl)) {
      return { error: { key: "course.admin.error.chapterVideoLink", vars: { chapterId: chapter.id } } };
    }
    const description = chapter.description?.trim() ?? "";
    if (description.length > MAX_CHAPTER_DESCRIPTION_LENGTH) {
      return { error: { key: "course.admin.error.chapterDescriptionTooLong" } };
    }
    next.push({
      id: chapter.id,
      title,
      variations,
      ...(videoUrl ? { videoUrl, hasVideo: true } : {}),
      ...(description ? { description } : {}),
    });
  }
  return { chapters: next };
}
