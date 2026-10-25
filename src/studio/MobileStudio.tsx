"use client";

import { BoardPanel } from "./BoardPanel";
import { MobileMoveStrip } from "./MobileMoveStrip";

// SIG-1043: single-column studio layout below 768 px. Rendered inside the
// shell's h-screen column between MenuBar and StatusBar, so this root fills
// the leftover height (flex-1) instead of taking a full viewport of its own.
// The board stays at the top sized to the viewport width; the move strip
// sits directly below. Engine/Review/Explorer tabs arrive in SIG-1108.
export function MobileStudio() {
  return (
    <div
      data-mobile-studio=""
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-studio-bg"
    >
      <div className="aspect-square w-full shrink-0 bg-studio-panel [container-type:size]">
        <BoardPanel />
      </div>
      <MobileMoveStrip />
      <div className="min-h-0 flex-1 bg-studio-bg" />
    </div>
  );
}
