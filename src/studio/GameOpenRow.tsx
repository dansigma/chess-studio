"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
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
  children,
}: {
  onOpen: () => void;
  onOpenNew: () => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
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
      title={title ?? "Open; double-click or Shift+Enter opens in a new board"}
      aria-label={ariaLabel}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </button>
  );
}
