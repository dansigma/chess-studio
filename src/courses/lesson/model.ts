// SIG-1370: pure helpers behind the lesson study layout.
import type { CourseChapter, VariationProgress } from "../types";

export type ChapterSegment = {
  id: string;
  /** 1-based position in the chapter. */
  index: number;
  learned: boolean;
  current: boolean;
};

/** One segment per line of the chapter, in order. */
export function chapterSegments(
  chapter: Pick<CourseChapter, "variations">,
  progress: Record<string, VariationProgress | undefined>,
  currentId: string,
): ChapterSegment[] {
  return chapter.variations.map((variation, i) => ({
    id: variation.id,
    index: i + 1,
    learned: Boolean(progress[variation.id]?.learned),
    current: variation.id === currentId,
  }));
}

/**
 * Step that "end" jumps to: the furthest frame already reached, never past it,
 * so the student's own moves are never skipped. A learned line is fully reached.
 */
export function lastReachedStep(
  reached: number,
  learned: boolean,
  frameCount: number,
): number {
  const last = Math.max(frameCount - 1, 0);
  return learned ? last : Math.max(0, Math.min(reached, last));
}

export type LessonShortcut =
  "start" | "back" | "forward" | "end" | "flip" | "help";

type KeyLike = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
};

/** Maps a key event to a lesson action; null for text fields, modifier combos and other keys. */
export function lessonShortcut(event: KeyLike): LessonShortcut | null {
  const target = event.target as
    { tagName?: string; isContentEditable?: boolean } | null | undefined;
  if (
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  ) {
    return null;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return null;
  }
  switch (event.key) {
    case "Home":
      return "start";
    case "ArrowLeft":
      return "back";
    case "ArrowRight":
      return "forward";
    case "End":
      return "end";
    case "f":
    case "F":
      return "flip";
    case "?":
      return "help";
    default:
      return null;
  }
}
