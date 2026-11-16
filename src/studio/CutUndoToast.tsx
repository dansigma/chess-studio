"use client";

import { useEffect } from "react";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { useStudioStore } from "@/src/store/studio-store";

/**
 * SIG-1384: how long the destructive-cut undo stays offered. `Delete` and
 * `Ctrl+Delete` cut moves immediately, so the toast is the way back — it never
 * blocks the board the way a confirmation dialog would.
 */
export const CUT_UNDO_MS = 5000;

/**
 * SIG-1384: non-blocking "Desfazer" toast for the last cut. It dismisses itself
 * after {@link CUT_UNDO_MS}, on Escape, or as soon as any newer tree edit lands
 * (the store drops the snapshot), so the button can never undo later work.
 */
export function CutUndoToast() {
  const pending = useStudioStore((state) => state.pendingCutUndo);
  const undoCut = useStudioStore((state) => state.undoCut);
  const dismissCutUndo = useStudioStore((state) => state.dismissCutUndo);
  const locale = useStudioStore((state) => state.settings.locale);

  useEffect(() => {
    if (!pending) {
      return;
    }
    const handle = setTimeout(dismissCutUndo, CUT_UNDO_MS);
    return () => clearTimeout(handle);
  }, [pending, dismissCutUndo]);

  useEffect(() => {
    if (!pending) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismissCutUndo();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending, dismissCutUndo]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-12 left-1/2 z-[1050] -translate-x-1/2"
    >
      {pending ? (
        <span className="pointer-events-auto flex items-center gap-2 rounded-full border border-studio-border-strong bg-studio-elevated px-3 py-1.5 text-dense text-studio-muted shadow-2xl">
          <span className="truncate">{tStudioChrome(locale, "chrome.toast.cut")}</span>
          <button
            type="button"
            onClick={undoCut}
            className="rounded-full px-1.5 py-0.5 font-semibold text-studio-accent-text hover:bg-studio-hover-strong focus-visible:outline-2 focus-visible:outline-studio-accent"
          >
            {tStudioChrome(locale, "chrome.toast.undo")}
          </button>
        </span>
      ) : null}
    </div>
  );
}
