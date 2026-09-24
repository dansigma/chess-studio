"use client";

import { useEffect, useRef } from "react";
import { MenuDivider, MenuItem, MenuSurface } from "./ui/Menu";

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
    <div ref={rootRef} className="fixed z-50" style={{ left, top }}>
      <MenuSurface className="min-w-52">
        <MenuItem
          label="Flip board"
          shortcut="Ctrl+F"
          onClick={() => {
            onFlip();
            onClose();
          }}
        />
        <MenuItem
          label="Show evaluation bar"
          checked={showEvalBar}
          onClick={() => {
            onToggleEvalBar();
            onClose();
          }}
        />
        <MenuDivider />
        <MenuItem
          label="Copy FEN"
          onClick={() => {
            onCopyFen();
            onClose();
          }}
        />
        <MenuItem
          label="Copy board image"
          onClick={() => {
            onCopyImage();
            onClose();
          }}
        />
      </MenuSurface>
    </div>
  );
}
