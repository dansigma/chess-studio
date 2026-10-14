export const DEFAULT_SIDEBAR_WIDTH = 256;
export const MIN_SIDEBAR_WIDTH = 160;
export const MAX_SIDEBAR_WIDTH = 480;
export const MAX_SIDEBAR_VIEWPORT_RATIO = 0.4;

/**
 * Clamps the requested sidebar width between MIN_SIDEBAR_WIDTH (160px) and
 * MAX_SIDEBAR_WIDTH (480px or 40% of the viewport, whichever is smaller).
 * Falls back safely to DEFAULT_SIDEBAR_WIDTH (256px) when width is invalid.
 */
export function clampSidebarWidth(width: number, viewportWidth?: number): number {
  if (!Number.isFinite(width)) {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  let maxAllowed = MAX_SIDEBAR_WIDTH;
  if (typeof viewportWidth === "number" && Number.isFinite(viewportWidth) && viewportWidth > 0) {
    const ratioBound = Math.floor(viewportWidth * MAX_SIDEBAR_VIEWPORT_RATIO);
    maxAllowed = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, ratioBound));
  }

  const rounded = Math.round(width);
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(rounded, maxAllowed));
}
