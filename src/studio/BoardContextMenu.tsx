"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tLibrary } from "@/src/i18n/library-strings.ts";
import { tRepertoire } from "@/src/i18n/repertoire-strings.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { LayoutsSubmenu } from "./LayoutsMenu";
import { MenuDivider, MenuItem, MenuSurface } from "./ui/Menu";
export type BoardMenuState = {
  x: number;
  y: number;
};

const FALLBACK_MENU_WIDTH = 220;
const FALLBACK_MENU_HEIGHT = 340;
const VIEWPORT_MARGIN = 8;

function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { left: number; top: number } {
  if (typeof window === "undefined") {
    return { left: x, top: y };
  }
  const left = Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN));
  const top = Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN));
  return { left, top };
}

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
  onSearchLibrary,
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
  onSearchLibrary?: () => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number }>(() =>
    clampMenuPosition(menu.x, menu.y, FALLBACK_MENU_WIDTH, FALLBACK_MENU_HEIGHT),
  );

  useLayoutEffect(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    const width = rect && rect.width > 0 ? rect.width : FALLBACK_MENU_WIDTH;
    const height = rect && rect.height > 0 ? rect.height : FALLBACK_MENU_HEIGHT;
    const next = clampMenuPosition(menu.x, menu.y, width, height);
    setPosition((prev) => (prev.left === next.left && prev.top === next.top ? prev : next));
  }, [menu.x, menu.y, repertoireColor, onSearchLibrary]);

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

  return (
    <div ref={rootRef} className="fixed z-[1100]" style={position}>
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
        <MenuDivider />
        {/* SIG-1316: same Layouts options as View → Layouts. */}
        <LayoutsSubmenu
          locale={locale}
          open={layoutsOpen}
          onOpen={() => setLayoutsOpen(true)}
          onClose={() => setLayoutsOpen(false)}
          run={(action) => () => {
            action();
            onClose();
          }}
        />
        {onSearchLibrary ? (
          <>
            <MenuDivider />
            <MenuItem
              label={tLibrary(locale, "library.position.searchFromStudio")}
              onClick={() => {
                onSearchLibrary();
                onClose();
              }}
            />
          </>
        ) : null}
      </MenuSurface>
    </div>
  );
}
