"use client";

import { useEffect } from "react";
import { marksAreEmpty, type BoardMarks } from "@/src/chess/marks";
import { useStudioStore } from "@/src/store/studio-store";

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
