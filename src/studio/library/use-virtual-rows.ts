"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export type VirtualWindow = {
  /** First rendered row index (inclusive). */
  start: number;
  /** Last rendered row index (exclusive). */
  end: number;
  /** Pixels above the first rendered row. */
  offsetTop: number;
  /** Height of the whole list. */
  totalHeight: number;
};

/** SIG-1277: rows to render for a scroll position, with `overscan` extra rows each side. */
export function computeVirtualWindow(options: {
  count: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
  overscan?: number;
}): VirtualWindow {
  const { count, rowHeight } = options;
  const overscan = options.overscan ?? 6;
  const totalHeight = Math.max(0, count) * rowHeight;
  if (count <= 0 || rowHeight <= 0) {
    return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 };
  }
  const scrollTop = Math.max(0, Math.min(options.scrollTop, Math.max(0, totalHeight - options.viewportHeight)));
  const first = Math.floor(scrollTop / rowHeight);
  const last = Math.ceil((scrollTop + Math.max(0, options.viewportHeight)) / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, Math.max(last, first + 1) + overscan);
  return { start, end, offsetTop: start * rowHeight, totalHeight };
}

/** New scrollTop that brings row `index` fully into view, or the current one if it already is. */
export function scrollTopToReveal(options: {
  index: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
}): number {
  const rowTop = options.index * options.rowHeight;
  const rowBottom = rowTop + options.rowHeight;
  if (rowTop < options.scrollTop) {
    return rowTop;
  }
  if (rowBottom > options.scrollTop + options.viewportHeight) {
    return Math.max(0, rowBottom - options.viewportHeight);
  }
  return options.scrollTop;
}

/** True when the rendered window reaches within `threshold` rows of the end of the loaded list. */
export function nearEnd(end: number, count: number, threshold = 10): boolean {
  return count > 0 && end >= count - threshold;
}

const FALLBACK_VIEWPORT = 480;

/** Fixed-row-height windowing over a scroll container (no dependency). */
export function useVirtualRows(options: {
  containerRef: RefObject<HTMLElement | null>;
  count: number;
  rowHeight: number;
  overscan?: number;
}) {
  const { containerRef, count, rowHeight, overscan } = options;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(FALLBACK_VIEWPORT);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }
    const measure = () => {
      if (node.clientHeight > 0) {
        setViewportHeight(node.clientHeight);
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef]);

  const onScroll = useCallback(() => {
    const node = containerRef.current;
    if (node) {
      setScrollTop(node.scrollTop);
    }
  }, [containerRef]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const node = containerRef.current;
      if (!node) {
        return;
      }
      const next = scrollTopToReveal({ index, rowHeight, scrollTop: node.scrollTop, viewportHeight });
      if (next !== node.scrollTop) {
        node.scrollTop = next;
        setScrollTop(next);
      }
    },
    [containerRef, rowHeight, viewportHeight],
  );

  const window = computeVirtualWindow({ count, rowHeight, scrollTop, viewportHeight, overscan });
  return { ...window, onScroll, scrollToIndex };
}
