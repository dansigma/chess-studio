"use client";

import { useCallback, useEffect, useState } from "react";
import { marksAreEmpty, type BoardMarks } from "@/src/chess/marks";
import { useStudioStore } from "@/src/store/studio-store";

export type PinnedMark<T> = {
  id: string;
  value: T;
};

/**
 * Shared hover + click-to-pin state for board marks (Insights & Review Why?).
 * `active` prefers transient hover over the pinned entry; unpinning also clears
 * hover so marks vanish immediately even while the pointer or focus stays on
 * the row. Resets whenever `resetKey` changes.
 */
export function usePinnedMarks<T>(resetKey?: string) {
  const [hover, setHover] = useState<T | null>(null);
  const [pinned, setPinned] = useState<PinnedMark<T> | null>(null);
  const [prevKey, setPrevKey] = useState(resetKey);

  const reset = prevKey !== resetKey;
  if (reset) {
    setPrevKey(resetKey);
    if (hover !== null) {
      setHover(null);
    }
    if (pinned !== null) {
      setPinned(null);
    }
  }

  const clear = useCallback(() => {
    setHover(null);
    setPinned(null);
  }, []);

  const clearHover = useCallback(() => {
    setHover(null);
  }, []);

  const togglePin = useCallback(
    (id: string, value: T) => {
      if (pinned?.id === id) {
        setPinned(null);
        setHover(null);
      } else {
        setPinned({ id, value });
      }
    },
    [pinned?.id],
  );

  const isPinned = useCallback((id: string) => !reset && pinned?.id === id, [reset, pinned?.id]);

  const bindItem = useCallback(
    (id: string, value: T) => ({
      "aria-pressed": !reset && pinned?.id === id,
      onMouseEnter: () => setHover(value),
      onMouseLeave: clearHover,
      onFocus: () => setHover(value),
      onBlur: clearHover,
      onClick: () => togglePin(id, value),
    }),
    [reset, pinned?.id, clearHover, togglePin],
  );

  return {
    active: reset ? null : (hover ?? pinned?.value ?? null),
    pinned: reset ? null : pinned,
    clearHover,
    clear,
    isPinned,
    bindItem,
  };
}

/**
 * SIG-959: publishes the Insights panel's marks to the transient
 * `insightMarks` channel — never `setNodeMarks`, so nothing here marks the
 * game dirty, enters the PGN or is persisted. `fen` is the position the marks
 * were computed for; the board only draws them when it shows that position.
 * Cleared when the marks go away and when the panel unmounts.
 */
export function useInsightMarks(fen: string | null, marks: BoardMarks | null): void {
  const setInsightMarks = useStudioStore((state) => state.setInsightMarks);
  useEffect(() => {
    if (!fen || !marks || marksAreEmpty(marks)) {
      setInsightMarks(null);
      return;
    }
    setInsightMarks({ fen, marks });
    return () => setInsightMarks(null);
  }, [fen, marks, setInsightMarks]);
}
