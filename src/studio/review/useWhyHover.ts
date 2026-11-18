"use client";

import { useEffect, useRef } from "react";
import type { BoardMarks } from "@/src/chess/marks";
import { useStudioStore } from "@/src/store/studio-store";
import { useInsightMarks, usePinnedMarks } from "../useInsightMarks";

export type WhyHover = { marks: BoardMarks; at: "before" | "after" };

const previewKey = (fen: string) => `why:${fen}`;

/**
 * SIG-961 / SIG-1402: hover and click-to-pin marks for the "Why?" block.
 * Marks travel through the same transient Insights channel as SIG-959 (never
 * the game tree, so nothing is dirtied, saved or exported). Statements about
 * the position before the move borrow the board's preview slot to show it,
 * like the Insights "Before move" tab, and drop the pin if the preview slot
 * is cleared externally (e.g. clicking the board).
 */
export function useWhyHover(fenBefore: string, fenAfter: string, rowKey = "") {
  const setupMode = useStudioStore((state) => state.setupMode);
  const setEnginePreview = useStudioStore((state) => state.setEnginePreview);
  const slotKey = useStudioStore((state) => state.enginePreview?.key ?? null);

  const { active, clearHover, clear, isPinned, bindItem } = usePinnedMarks<WhyHover>(
    `${fenBefore}|${fenAfter}|${rowKey}|${setupMode ? 1 : 0}`,
  );

  const expectedKey = previewKey(fenBefore);
  const previewFen = !setupMode && active?.at === "before" ? fenBefore : null;
  const acquiredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!previewFen) {
      acquiredRef.current = null;
      return;
    }
    if (slotKey === expectedKey) {
      acquiredRef.current = expectedKey;
      return;
    }
    if (acquiredRef.current === expectedKey) {
      // BoardPanel (or another owner) cleared enginePreview externally while active:
      // drop the pin instead of re-claiming in a loop.
      acquiredRef.current = null;
      clear();
      return;
    }
    if (slotKey === null) {
      setEnginePreview({ fen: previewFen, lastMove: "", key: expectedKey });
    }
  }, [previewFen, slotKey, expectedKey, setEnginePreview, clear]);

  useEffect(() => {
    if (!previewFen) {
      return;
    }
    return () => {
      if (useStudioStore.getState().enginePreview?.key === expectedKey) {
        setEnginePreview(null);
      }
    };
  }, [previewFen, expectedKey, setEnginePreview]);

  // Marks only draw on the position they were computed for; while the preview
  // slot is still being claimed they wait for it.
  const previewing = active?.at === "before" && slotKey !== expectedKey;
  useInsightMarks(
    !setupMode && active && !previewing ? (active.at === "before" ? fenBefore : fenAfter) : null,
    active?.marks ?? null,
  );

  return { isPinned, bindItem, clearHover };
}
