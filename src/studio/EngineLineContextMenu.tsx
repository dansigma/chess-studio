"use client";

import { useEffect, useRef } from "react";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { useStudioStore } from "@/src/store/studio-store";
import { MenuItem, MenuSurface } from "./ui/Menu";

export type EngineLineMenuState = {
  x: number;
  y: number;
  multipv: number;
  pvUci: string[];
};

export function resolveEngineLineInsert(menu: EngineLineMenuState): string[][] | null {
  if (menu.pvUci.length === 0) {
    return null;
  }
  return [[...menu.pvUci]];
}

export function clampEngineMenuPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  return {
    left: Math.max(8, Math.min(x, viewportWidth - 220)),
    top: Math.max(8, Math.min(y, viewportHeight - 180)),
  };
}

export function EngineLineContextMenu({
  menu,
  fen,
  locale = "en",
  onClose,
}: {
  menu: EngineLineMenuState;
  fen: string;
  locale?: SiteLocale;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function onScroll(event: Event) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function onBlur() {
      onClose();
    }
    window.addEventListener("mousedown", onPointer);
    // Capture catches engine-list scroll as well as any other scroll.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [onClose]);

  const { left, top } = clampEngineMenuPosition(menu.x, menu.y, window.innerWidth, window.innerHeight);

  return (
    <div ref={rootRef} className="fixed z-[1100]" style={{ left, top }}>
      <MenuSurface className="min-w-52" onClose={onClose} label={tPanels(locale, "engine.lineMenu")}>
        <MenuItem
          label={tPanels(locale, "engine.insertLine")}
          disabled={menu.pvUci.length === 0}
          onClick={() => {
            const lines = resolveEngineLineInsert(menu);
            if (!lines) {
              onClose();
              return;
            }
            useStudioStore.getState().insertEngineLines(fen, lines);
            onClose();
          }}
        />
      </MenuSurface>
    </div>
  );
}
