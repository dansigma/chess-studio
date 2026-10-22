"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { useStudioStore } from "@/src/store/studio-store";
import { createSingleDoubleClick } from "./game-open-click";

// SIG-910: shared game-row button. Single-click fires onOpen (preview);
// double-click or Shift+Enter fires onOpenNew (independent board). The
// discriminator defers the single action ~250ms so a double-click does not
// also trigger the preview load. Refs are only touched inside effects and
// event handlers, never during render.
export function GameOpenRow({
  onOpen,
  onOpenNew,
  className,
  title,
  ariaLabel,
  locale,
  children,
}: {
  onOpen: () => void;
  onOpenNew: () => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
  locale?: SiteLocale;
  children: ReactNode;
}) {
  const storeLocale = useStudioStore((state) => state.settings.locale);
  const effectiveLocale = locale ?? storeLocale;
  const resolvedTitle = title ?? tPanels(effectiveLocale, "row.openHint");
  const openRef = useRef(onOpen);
  const openNewRef = useRef(onOpenNew);
  const clickRef = useRef<ReturnType<typeof createSingleDoubleClick> | null>(null);

  useEffect(() => {
    openRef.current = onOpen;
    openNewRef.current = onOpenNew;
    if (clickRef.current === null) {
      clickRef.current = createSingleDoubleClick({
        onSingle: () => openRef.current(),
        onDouble: () => openNewRef.current(),
      });
    }
  });

  useEffect(() => () => clickRef.current?.dispose(), []);

  function handleClick(): void {
    clickRef.current?.handleClick();
  }

  function handleDoubleClick(): void {
    clickRef.current?.handleDoubleClick();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
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
