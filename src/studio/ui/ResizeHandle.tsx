"use client";

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  clampSidebarWidth,
} from "../sidebar-width";

export interface ResizeHandleProps {
  sidebarRef: React.RefObject<HTMLElement | null>;
  sidebarWidth: number;
  onResize: (width: number) => void;
  onResizeEnd?: () => void;
}

export function ResizeHandle({
  sidebarRef,
  sidebarWidth,
  onResize,
  onResizeEnd,
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ sidebarLeft: number; pointerId: number } | null>(null);

  const cleanupDrag = () => {
    if (dragRef.current) {
      dragRef.current = null;
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      onResizeEnd?.();
    }
  };

  useEffect(() => {
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();

    let sidebarLeft = 0;
    if (sidebarRef.current) {
      const rect = sidebarRef.current.getBoundingClientRect();
      sidebarLeft = rect.left;
    } else {
      sidebarLeft = event.clientX - sidebarWidth;
    }

    dragRef.current = {
      sidebarLeft,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return;
    }
    const windowWidth = typeof window !== "undefined" ? window.innerWidth : undefined;
    const requestedWidth = event.clientX - dragRef.current.sidebarLeft;
    const nextWidth = clampSidebarWidth(requestedWidth, windowWidth);
    onResize(nextWidth);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current && dragRef.current.pointerId === event.pointerId) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore pointer capture errors during release
      }
      cleanupDrag();
    }
  };

  const handleDoubleClick = () => {
    const windowWidth = typeof window !== "undefined" ? window.innerWidth : undefined;
    onResize(clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH, windowWidth));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const windowWidth = typeof window !== "undefined" ? window.innerWidth : undefined;
    const step = event.shiftKey ? 16 : 8;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onResize(clampSidebarWidth(sidebarWidth - step, windowWidth));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onResize(clampSidebarWidth(sidebarWidth + step, windowWidth));
    } else if (event.key === "Home") {
      event.preventDefault();
      onResize(clampSidebarWidth(MIN_SIDEBAR_WIDTH, windowWidth));
    } else if (event.key === "End") {
      event.preventDefault();
      onResize(clampSidebarWidth(MAX_SIDEBAR_WIDTH, windowWidth));
    } else if (event.key === "Enter") {
      event.preventDefault();
      onResize(clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH, windowWidth));
    }
  };

  const maxVal =
    typeof window !== "undefined"
      ? Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.4)))
      : MAX_SIDEBAR_WIDTH;

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-valuenow={sidebarWidth}
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={maxVal}
      aria-label="Resize sidebar"
      className="group relative flex w-2 shrink-0 cursor-col-resize select-none items-center justify-center outline-none focus-visible:outline-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={cleanupDrag}
      onLostPointerCapture={cleanupDrag}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className={`h-full w-1 rounded-full transition-colors ${
          isDragging
            ? "bg-studio-accent"
            : "bg-transparent group-hover:bg-studio-border group-focus-visible:bg-studio-accent"
        }`}
      />
    </div>
  );
}
