"use client";

import { useEffect, useRef } from "react";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tRepertoire } from "@/src/i18n/repertoire-strings.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { MenuDivider, MenuItem, MenuSurface } from "./ui/Menu";
export type BoardMenuState = {
  x: number;
  y: number;
};

export function BoardContextMenu({
  menu,
  showEvalBar,
  showThreat,
  repertoireColor = null,
  locale = "en",
  onFlip,
  onToggleEvalBar,
  onToggleThreat,
  onMarkWhite,
  onMarkBlack,
  onClearMark,
  onCopyFen,
  onCopyImage,
  onClose,
}: {
  menu: BoardMenuState;
  showEvalBar: boolean;
  showThreat: boolean;
  repertoireColor?: "white" | "black" | null;
  locale?: SiteLocale;
  onFlip: () => void;
  onToggleEvalBar: () => void;
  onToggleThreat: () => void;
  onMarkWhite: () => void;
  onMarkBlack: () => void;
  onClearMark: () => void;
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
          label={tPanels(locale, "panels.board.flip")}
          shortcut="Ctrl+F"
          onClick={() => {
            onFlip();
            onClose();
          }}
        />
        <MenuItem
          label={tPanels(locale, "panels.board.showEvalBar")}
          checked={showEvalBar}
          onClick={() => {
            onToggleEvalBar();
            onClose();
          }}
        />
        <MenuItem
          label={tPanels(locale, "panels.board.showThreat")}
          checked={showThreat}
          onClick={() => {
            onToggleThreat();
            onClose();
          }}
        />
        <MenuDivider />
        <MenuItem
          label={tRepertoire(locale, "repertoire.mark.useWhite")}
          checked={repertoireColor === "white"}
          onClick={() => {
            onMarkWhite();
            onClose();
          }}
        />
        <MenuItem
          label={tRepertoire(locale, "repertoire.mark.useBlack")}
          checked={repertoireColor === "black"}
          onClick={() => {
            onMarkBlack();
            onClose();
          }}
        />
        {repertoireColor !== null ? (
          <MenuItem
            label={tRepertoire(locale, "repertoire.mark.remove")}
            onClick={() => {
              onClearMark();
              onClose();
            }}
          />
        ) : null}
        <MenuDivider />
        <MenuItem
          label={tPanels(locale, "panels.board.copyFen")}
          onClick={() => {
            onCopyFen();
            onClose();
          }}
        />
        <MenuItem
          label={tPanels(locale, "panels.board.copyImage")}
          onClick={() => {
            onCopyImage();
            onClose();
          }}
        />
      </MenuSurface>
    </div>
  );
}
