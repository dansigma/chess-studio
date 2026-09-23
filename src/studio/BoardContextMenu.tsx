"use client";

import { useEffect, useRef } from "react";

export type BoardMenuState = {
  x: number;
  y: number;
};

export function BoardContextMenu({
  menu,
  showEvalBar,
  onFlip,
  onToggleEvalBar,
  onCopyFen,
  onCopyImage,
  onClose,
}: {
  menu: BoardMenuState;
  showEvalBar: boolean;
  onFlip: () => void;
  onToggleEvalBar: () => void;
  onCopyFen: () => void;
  onCopyImage: () => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 220));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - 180));

  return (
    <div
      ref={rootRef}
      className="fixed z-50 w-52 rounded border border-studio-border bg-studio-elevated py-1 shadow-2xl"
      style={{ left, top }}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        className="w-full px-3 py-1.5 text-left text-[13px] text-studio-fg hover:bg-studio-accent hover:text-white"
        onClick={() => {
          onFlip();
          onClose();
        }}
      >
        Flip board
      </button>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={showEvalBar}
        className="w-full px-3 py-1.5 text-left text-[13px] text-studio-fg hover:bg-studio-accent hover:text-white"
        onClick={() => {
          onToggleEvalBar();
          onClose();
        }}
      >
        {showEvalBar ? "Hide evaluation bar" : "Show evaluation bar"}
      </button>
      <button
        type="button"
        role="menuitem"
        className="w-full px-3 py-1.5 text-left text-[13px] text-studio-fg hover:bg-studio-accent hover:text-white"
        onClick={() => {
          onCopyFen();
          onClose();
        }}
      >
        Copy FEN
      </button>
      <button
        type="button"
        role="menuitem"
        className="w-full px-3 py-1.5 text-left text-[13px] text-studio-fg hover:bg-studio-accent hover:text-white"
        onClick={() => {
          onCopyImage();
          onClose();
        }}
      >
        Copy board image
      </button>
    </div>
  );
}
