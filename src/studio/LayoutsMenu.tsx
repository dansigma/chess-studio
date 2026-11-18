"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useStudioStore } from "@/src/store/studio-store";
import { DOCK_PRESET_IDS } from "./dock-layout";
import { presetLayoutKey, savedLayoutKey } from "./dock-layouts";
import { MenuDivider, MenuItem, MenuSurface } from "./ui/Menu";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tStudioChrome, type StudioChromeStringKey } from "@/src/i18n/studio-chrome-strings";

// SIG-1316: the Layouts entries shared by the View menu and the board
// context menu — built-in presets, the user's saved layouts, then "Save
// current layout…" and "Manage layouts…" (both open a dialog hosted by
// LayoutDialogs). `run` wraps an action so the host menu closes after it.
export function LayoutsMenuItems({
  locale,
  run,
}: {
  locale: SiteLocale;
  run: (action: () => void) => () => void;
}) {
  const savedLayouts = useStudioStore((state) => state.savedLayouts);
  const currentKey = useStudioStore((state) => state.currentLayoutKey);
  const store = useStudioStore.getState;
  return (
    <>
      {DOCK_PRESET_IDS.map((id) => (
        <MenuItem
          key={id}
          label={tStudioChrome(locale, `chrome.layouts.preset.${id}` as StudioChromeStringKey)}
          checked={currentKey === presetLayoutKey(id)}
          radio
          onClick={run(() => store().applyPresetLayout(id))}
        />
      ))}
      {savedLayouts.length > 0 ? (
        <>
          <MenuDivider />
          {savedLayouts.map((layout) => (
            <MenuItem
              key={layout.id}
              label={layout.name}
              checked={currentKey === savedLayoutKey(layout.id)}
              radio
              onClick={run(() => store().applySavedLayout(layout.id))}
            />
          ))}
        </>
      ) : null}
      <MenuDivider />
      <MenuItem
        label={tStudioChrome(locale, "chrome.layouts.save")}
        onClick={run(() => store().setLayoutDialog("save"))}
      />
      <MenuItem
        label={tStudioChrome(locale, "chrome.layouts.manage")}
        onClick={run(() => store().setLayoutDialog("manage"))}
      />
    </>
  );
}

type SubmenuPlacement = {
  flipLeft: boolean;
  flipUp: boolean;
  topOffset: number | null;
};

const DEFAULT_SUBMENU_PLACEMENT: SubmenuPlacement = {
  flipLeft: false,
  flipUp: false,
  topOffset: null,
};

const SUBMENU_FALLBACK_WIDTH = 208;
const SUBMENU_FALLBACK_HEIGHT = 260;
const SUBMENU_GAP = 6;
const VIEWPORT_MARGIN = 8;

export function LayoutsSubmenu({
  locale,
  open,
  flipLeft: flipLeftProp,
  onOpen,
  onClose,
  run,
  children,
}: {
  locale: SiteLocale;
  open: boolean;
  flipLeft?: boolean;
  onOpen: () => void;
  onClose?: () => void;
  run: (action: () => void) => () => void;
  children?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<SubmenuPlacement>(DEFAULT_SUBMENU_PLACEMENT);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }
    const triggerRect = wrap.getBoundingClientRect();
    const submenuEl = wrap.querySelector<HTMLElement>('[role="menu"]');
    const submenuRect = submenuEl?.getBoundingClientRect();
    const submenuWidth =
      submenuRect && submenuRect.width > 0 ? submenuRect.width : SUBMENU_FALLBACK_WIDTH;
    const submenuHeight =
      submenuRect && submenuRect.height > 0 ? submenuRect.height : SUBMENU_FALLBACK_HEIGHT;

    const hasHorizontalMeasure = triggerRect.width > 0 || triggerRect.right > 0;
    const nextFlipLeft =
      flipLeftProp ??
      (hasHorizontalMeasure &&
        triggerRect.right + SUBMENU_GAP + submenuWidth > window.innerWidth - VIEWPORT_MARGIN);

    const hasVerticalMeasure = triggerRect.height > 0 || triggerRect.bottom > 0;
    const overflowsBottom =
      hasVerticalMeasure &&
      triggerRect.top - 5 + submenuHeight > window.innerHeight - VIEWPORT_MARGIN;

    let nextTopOffset: number | null = null;
    if (overflowsBottom) {
      const upwardTop = triggerRect.bottom + 5 - submenuHeight;
      const upwardBottom = triggerRect.bottom + 5;
      if (upwardTop < VIEWPORT_MARGIN || upwardBottom > window.innerHeight - VIEWPORT_MARGIN) {
        const clampedTop = Math.max(
          VIEWPORT_MARGIN,
          Math.min(upwardTop, window.innerHeight - VIEWPORT_MARGIN - submenuHeight),
        );
        nextTopOffset = clampedTop - triggerRect.top;
      }
    }

    setPlacement((prev) =>
      prev.flipLeft === nextFlipLeft &&
      prev.flipUp === overflowsBottom &&
      prev.topOffset === nextTopOffset
        ? prev
        : { flipLeft: nextFlipLeft, flipUp: overflowsBottom, topOffset: nextTopOffset },
    );
  }, [open, flipLeftProp]);

  const resolvedFlipLeft = flipLeftProp ?? placement.flipLeft;
  const horizontalClass = resolvedFlipLeft ? "right-full mr-1.5" : "left-full ml-1.5";
  const verticalClass =
    placement.topOffset !== null
      ? ""
      : placement.flipUp
        ? "bottom-[-5px]"
        : "top-[-5px]";
  const verticalStyle =
    placement.topOffset !== null ? { top: `${placement.topOffset}px` } : undefined;

  return (
    <div ref={wrapRef} className="relative">
      <MenuItem
        label={tStudioChrome(locale, "chrome.view.layouts")}
        submenu
        highlighted={open}
        onMouseEnter={onOpen}
        onClick={onOpen}
      />
      {open ? (
        <MenuSurface
          style={verticalStyle}
          className={`absolute ${horizontalClass} ${verticalClass} max-h-80 min-w-52 overflow-auto`}
          onClose={onClose}
        >
          <LayoutsMenuItems locale={locale} run={run} />
          {children}
        </MenuSurface>
      ) : null}
    </div>
  );
}
