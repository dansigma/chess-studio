"use client";

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { useStudioStore } from "@/src/store/studio-store";
import { createSingleDoubleClick } from "./game-open-click";

// SIG-910: shared game-row button. When preview mode is enabled, single-click
// fires onOpen (preview) and double-click or Shift+Enter fires onOpenNew
// (independent board); the discriminator defers the single action ~250ms so
// a double-click does not also trigger the preview load. When preview mode is
// off, single-click fires onOpen immediately and dblclick is a no-op so a
// double-click never opens two boards. Refs are only touched inside effects and
// event handlers, never during render.
export function GameOpenRow({
  onOpen,
  onOpenNew,
  previewEnabled,
  className,
  title,
  ariaLabel,
  locale,
  children,
}: {
  onOpen: () => void;
  onOpenNew: () => void;
  previewEnabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
  locale?: SiteLocale;
  children: ReactNode;
}) {
  const storeLocale = useStudioStore((state) => state.settings.locale);
  const storePreviewEnabled = useStudioStore((state) => state.settings.gamePreviewEnabled);
  const effectiveLocale = locale ?? storeLocale;
  const effectivePreview = previewEnabled ?? storePreviewEnabled;
  const resolvedTitle = title ?? tPanels(effectiveLocale, "row.openHint");
  const openRef = useRef(onOpen);
  const openNewRef = useRef(onOpenNew);
  const previewRef = useRef(effectivePreview);
  const clickRef = useRef<ReturnType<typeof createSingleDoubleClick> | null>(null);

  useEffect(() => {
    openRef.current = onOpen;
    openNewRef.current = onOpenNew;
    previewRef.current = effectivePreview;
    if (!effectivePreview) {
      clickRef.current?.cancel();
    }
    if (clickRef.current === null) {
      clickRef.current = createSingleDoubleClick({
        onSingle: () => openRef.current(),
        onDouble: () => openNewRef.current(),
      });
    }
  });

  useEffect(() => () => clickRef.current?.dispose(), []);

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    if (!previewRef.current) {
      if (event.detail >= 2) {
        return;
      }
      openRef.current();
      return;
    }
    clickRef.current?.handleClick();
  }

  function handleDoubleClick(): void {
    if (!previewRef.current) {
      return;
    }
    clickRef.current?.handleDoubleClick();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      if (!previewRef.current) {
        openRef.current();
        return;
      }
      clickRef.current?.handleDoubleClick();
    }
  }

  return (
    <button
      type="button"
      className={className}
      title={resolvedTitle}
      aria-label={ariaLabel}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </button>
  );
}
