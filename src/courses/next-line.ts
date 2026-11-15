import type { VariationProgress } from "./types";

/**
 * The line a student should open next: the first line, in course order, that
 * is not learned yet. Null when there are no lines or every line is learned
 * (callers then link to the course page).
 */
export function nextLineId(
  variationIds: readonly string[],
  progress: Readonly<Record<string, VariationProgress | undefined>>,
): string | null {
  for (const id of variationIds) {
    if (!progress[id]?.learned) {
      return id;
    }
  }
  return null;
}

/** What `nextLineHref` needs from a course: its address and line order. */
export type CourseLineOrder = {
  slug: string;
  chapters: readonly {
    variations: readonly { id: string }[];
  }[];
};

/**
 * Address of the next line in course order: the next line of the chapter,
 * else the first line of the next chapter with lines, else the course page
 * once the last line is done. Unknown lines also fall back to the course page.
 */
export function nextLineHref(
  course: CourseLineOrder,
  currentId: string,
): string {
  const courseHref = `/courses/${course.slug}`;
  let takeNext = false;
  for (const chapter of course.chapters) {
    for (const variation of chapter.variations) {
      if (takeNext) {
        return `${courseHref}/${variation.id}`;
      }
      if (variation.id === currentId) {
        takeNext = true;
      }
    }
  }
  return courseHref;
}
