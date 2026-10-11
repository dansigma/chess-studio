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
  showThreat,
  onFlip,
  onToggleEvalBar,
  onToggleThreat,
  onCopyFen,
  onCopyImage,
  onClose,
}: {
  menu: BoardMenuState;
  showEvalBar: boolean;
  showThreat: boolean;
  onFlip: () => void;
  onToggleEvalBar: () => void;
  onToggleThreat: () => void;
  onCopyFen: () => void;
  onCopyImage: () => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 220));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - 180));

  return (
    <div ref={rootRef} className="fixed z-[1100]" style={{ left, top }}>
      <MenuSurface className="min-w-52" onClose={onClose}>
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
        <MenuItem
          label="Show threat"
          checked={showThreat}
          onClick={() => {
            onToggleThreat();
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
