import { importPgn } from "@/src/chess/pgn";
import type { CourseAdminMessage } from "@/src/i18n/course-admin-strings";
import type { CourseChapter, CourseVariation } from "./types";

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
    next.push({ id: chapter.id, title, variations });
  }
  return { chapters: next };
}
