"use client";

import { useEffect, useRef } from "react";
import { NAG_GLYPHS, type NagGroup } from "@/src/chess/nags";
import type { Path } from "@/src/chess/tree";
import { useMenuKeyDown } from "./ui/use-menu-keyboard";

const GROUPS: { id: NagGroup; title: string }[] = [
  { id: "move", title: "Move" },
  { id: "position", title: "Position" },
  { id: "other", title: "Informant" },
];

export type GlyphMenuState = {
  x: number;
  y: number;
  path: Path;
};

export function MoveGlyphMenu({
  menu,
  nags,
  onToggle,
  onClear,
  onComment,
  onClose,
}: {
  menu: GlyphMenuState;
  nags: number[];
  onToggle: (nag: number) => void;
  onClear: () => void;
  onComment: () => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleKeyDown = useMenuKeyDown(rootRef, onClose);

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

  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 268));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - 420));

  return (
    <div
      ref={rootRef}
      className="fixed z-[1100] w-64 rounded border border-studio-border bg-studio-elevated py-2 shadow-2xl"
      style={{ left, top }}
      role="menu"
      aria-label="Move annotations"
      onKeyDown={handleKeyDown}
    >
      {GROUPS.map((group) => (
        <div key={group.id} className="px-2 pb-1">
          <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-studio-faint">{group.title}</div>
          <div className="flex flex-wrap gap-1">
            {NAG_GLYPHS.filter((item) => item.group === group.id).map((item) => {
              const active = nags.includes(item.nag);
              return (
                <button
                  key={item.nag}
                  type="button"
                  title={`${item.label} (${item.glyph})`}
                  role="menuitemcheckbox"
                  aria-checked={active}
                  onClick={() => onToggle(item.nag)}
                  className={`min-w-9 rounded px-1.5 py-1 text-body ${
                    active
                      ? "bg-studio-accent-move text-studio-accent-fg"
                      : "bg-studio-hover-subtle text-studio-fg hover:bg-studio-hover"
                  }`}
                >
                  {item.glyph}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="mt-1 border-t border-studio-border px-2 pt-1">
        <button
          type="button"
          role="menuitem"
          className="w-full rounded px-2 py-1 text-left text-dense text-studio-fg hover:bg-studio-hover"
          onClick={onComment}
        >
          Comment on move…
        </button>
        <button
          type="button"
          role="menuitem"
          className="w-full rounded px-2 py-1 text-left text-dense text-studio-muted hover:bg-studio-hover disabled:opacity-40"
          disabled={nags.length === 0}
          onClick={onClear}
        >
          Clear glyphs
        </button>
      </div>
    </div>
  );
}
