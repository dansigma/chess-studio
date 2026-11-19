"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { IconButton } from "./ui/Button";
import { useDialogFocus } from "./ui/use-dialog-focus";

// SIG-1109: bottom-anchored sheet for the mobile studio menu. Same scrim,
// focus-trap, and Escape handling as Dialog, but the panel docks to the
// bottom (thumb-reachable) with a scrollable content area.
export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const locale = useStudioStore((state) => state.settings.locale);
  useDialogFocus(sheetRef);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (document.querySelector("[data-escape-defer]")) {
          return;
        }
        // A modal opened on top of the sheet (a Dialog rendered inside it or
        // after it) owns Escape: only the topmost layer closes.
        const modals = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
        if (modals.length > 0 && modals[modals.length - 1] !== sheetRef.current) {
          return;
        }
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-studio-scrim"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-mobile-menu-sheet=""
        className="max-h-[80dvh] w-full max-w-full animate-[studio-dialog-in_160ms_ease-out] overflow-hidden rounded-t-2xl border-t border-x border-studio-border-strong bg-studio-elevated shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3.5">
          <h2 id={titleId} className="text-title font-semibold text-studio-fg">{title}</h2>
          <IconButton label={tStudioChrome(locale, "chrome.dialog.close")} shortcut="Esc" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
        <div
          data-mobile-menu-content=""
          className="max-h-[calc(80dvh-64px)] min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-1"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
