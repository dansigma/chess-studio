"use client";

import type { ReactNode } from "react";
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

export function LayoutsSubmenu({
  locale,
  open,
  onOpen,
  onClose,
  run,
  children,
}: {
  locale: SiteLocale;
  open: boolean;
  onOpen: () => void;
  onClose?: () => void;
  run: (action: () => void) => () => void;
  children?: ReactNode;
}) {
  return (
    <div className="relative">
      <MenuItem
        label={tStudioChrome(locale, "chrome.view.layouts")}
        submenu
        highlighted={open}
        onMouseEnter={onOpen}
        onClick={onOpen}
      />
      {open ? (
        <MenuSurface className="absolute left-full top-[-5px] ml-1.5 max-h-80 min-w-52 overflow-auto" onClose={onClose}>
          <LayoutsMenuItems locale={locale} run={run} />
          {children}
        </MenuSurface>
      ) : null}
    </div>
  );
}
