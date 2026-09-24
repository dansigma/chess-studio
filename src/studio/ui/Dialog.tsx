"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button";
import { Kbd } from "./Controls";

export function Dialog({
  title,
  onClose,
  footer,
  hint,
  width = "w-[28rem]",
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  hint?: ReactNode;
  width?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-studio-scrim p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`${width} max-w-full animate-[studio-dialog-in_160ms_ease-out] rounded-xl border border-studio-border-strong bg-studio-elevated shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3.5">
          <h2 className="text-title font-semibold text-studio-fg">{title}</h2>
          <IconButton label="Close" shortcut="Esc" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="px-4 pb-4 pt-1 text-body text-studio-muted">{children}</div>
        {footer || hint ? (
          <div className="flex items-center gap-2 border-t border-studio-border px-4 py-3">
            <span className="mr-auto text-caption text-studio-faint">
              {hint ?? (
                <>
                  <Kbd>Esc</Kbd> to close
                </>
              )}
            </span>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
