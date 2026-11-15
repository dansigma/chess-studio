// SIG-1362: the open chapter lives in the page address (`?capitulo=2`,
// 1-based) so reload and Back keep it without making the course page dynamic.
// Unknown or out-of-range values fall back to the chapter grid.

export const CHAPTER_PARAM = "capitulo";

/** Zero-based chapter position → the URL value (0 → "1"). */
export function chapterParam(index: number): string {
  return String(index + 1);
}

/** URL value → zero-based chapter position; null opens the grid. */
export function chapterIndex(value: string | null | undefined, count: number): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  const position = Number(value);
  return Number.isSafeInteger(position) && position >= 1 && position <= count ? position - 1 : null;
}
