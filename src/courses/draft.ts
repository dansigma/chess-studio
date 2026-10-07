import { importPgn } from "@/src/chess/pgn";
import type { CourseChapter, CourseVariation } from "./types";

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
): { chapters: CourseChapter[] } | { error: string } {
  if (chapters.length > 40) {
    return { error: "A course can have at most 40 chapters." };
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
        return { error: `The line “${lineTitle || "untitled"}” needs a PGN.` };
      }
      if (pgn.length > 20000) {
        return { error: `The line “${lineTitle || "untitled"}” is too long.` };
      }
      if (importPgn(pgn).tree.children.length === 0) {
        return { error: `The line “${lineTitle || "untitled"}” has no valid moves.` };
      }
      variations.push({ id: variation.id, title: lineTitle, pgn });
    }
    if (variations.length > 40) {
      return { error: "A chapter can have at most 40 lines." };
    }
    next.push({ id: chapter.id, title, variations });
  }
  return { chapters: next };
}
