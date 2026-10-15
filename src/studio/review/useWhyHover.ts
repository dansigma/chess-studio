"use client";

import { useEffect, useState } from "react";
import type { BoardMarks } from "@/src/chess/marks";
import { useStudioStore } from "@/src/store/studio-store";
import { useInsightMarks } from "../useInsightMarks";

export type WhyHover = { marks: BoardMarks; at: "before" | "after" };

const previewKey = (fen: string) => `why:${fen}`;

/**
 * SIG-961: hover marks for the "Why?" block. Marks travel through the same
 * transient Insights channel as SIG-959 (never the game tree, so nothing is
 * dirtied, saved or exported). Statements about the position before the move
 * borrow the board's preview slot to show it, like the Insights "Before move"
 * tab, and give it back when the hover ends or another owner takes it.
 */
export function useWhyHover(fenBefore: string, fenAfter: string): (hover: WhyHover | null) => void {
  const [hover, setHover] = useState<WhyHover | null>(null);
  const setEnginePreview = useStudioStore((state) => state.setEnginePreview);
  const slotKey = useStudioStore((state) => state.enginePreview?.key ?? null);

  const previewFen = hover?.at === "before" ? fenBefore : null;
  useEffect(() => {
    if (!previewFen || slotKey !== null) {
      return;
    }
    setEnginePreview({ fen: previewFen, lastMove: "", key: previewKey(previewFen) });
  }, [previewFen, slotKey, setEnginePreview]);
  useEffect(() => {
    if (!previewFen) {
      return;
    }
    const key = previewKey(previewFen);
    return () => {
      if (useStudioStore.getState().enginePreview?.key === key) {
        setEnginePreview(null);
      }
    };
  }, [previewFen, setEnginePreview]);

  // Marks only draw on the position they were computed for; while the preview
  // slot is still being claimed they wait for it.
  const previewing = hover?.at === "before" && slotKey !== previewKey(fenBefore);
  useInsightMarks(hover && !previewing ? (hover.at === "before" ? fenBefore : fenAfter) : null, hover?.marks ?? null);

  return setHover;
}
