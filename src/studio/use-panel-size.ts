"use client";

import { useEffect, useState, type RefObject } from "react";

export type PanelSize = { width: number; height: number };

/**
 * SIG-1197: a panel's own content size. Panels can be dragged anywhere in
 * the dock, so they pick compact or full forms from this instead of a global
 * setting. Starts at `fallback` (server render / before the first observe).
 */
export function usePanelSize(
  ref: RefObject<HTMLElement | null>,
  fallback: PanelSize = { width: 1024, height: 768 },
): PanelSize {
  const [size, setSize] = useState<PanelSize>(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) {
        return;
      }
      const next = { width: Math.round(box.width), height: Math.round(box.height) };
      setSize((current) => (current.width === next.width && current.height === next.height ? current : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** SIG-1197: width from which notation puts its header and toolbar on one row. */
export const NOTATION_INLINE_MIN_WIDTH = 520;
/** SIG-1197: below this height the explorer folds its opening row into the source row. */
export const EXPLORER_COMPACT_MAX_HEIGHT = 300;
/** SIG-1197: below this height the engine hides its sparkline to keep a line visible. */
export const ENGINE_SPARKLINE_MIN_HEIGHT = 150;
