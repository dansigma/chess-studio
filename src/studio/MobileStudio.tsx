"use client";

import { useState } from "react";
import { BoardPanel } from "./BoardPanel";
import { EnginePanel } from "./EnginePanel";
import { ExplorerPanel } from "./ExplorerPanel";
import { MobileMoveStrip } from "./MobileMoveStrip";
import { NotationPanel } from "./NotationPanel";
import { ReviewPanel } from "./ReviewPanel";
import { tMobile } from "@/src/i18n/mobile-strings.ts";
import { useStudioStore } from "@/src/store/studio-store";

// SIG-1043: single-column studio layout below 768 px. Rendered inside the
// shell's h-screen column between MenuBar and StatusBar, so this root fills
// the leftover height (flex-1) instead of taking a full viewport of its own.
// The board stays at the top sized to the viewport width; the move strip
// sits directly below.
// SIG-1108: bottom tab bar switches between the existing desktop panels
// (Notation / Engine / Review / Explorer). Only the active panel is mounted
// so the engine and review never run in the background.
const TABS = ["moves", "engine", "review", "explorer"] as const;

export type MobileStudioTab = (typeof TABS)[number];

export function MobileStudio() {
  const locale = useStudioStore((state) => state.settings.locale);
  const [activeTab, setActiveTab] = useState<MobileStudioTab>("moves");

  return (
    <div
      data-mobile-studio=""
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-studio-bg"
    >
      <div className="aspect-square w-full shrink-0 bg-studio-panel [container-type:size]">
        <BoardPanel />
      </div>
      <MobileMoveStrip />
      <div data-mobile-panel-area="" id="mobile-panel-area" className="min-h-0 flex-1 overflow-auto">
        {activeTab === "moves" ? <NotationPanel /> : null}
        {activeTab === "engine" ? <EnginePanel /> : null}
        {activeTab === "review" ? <ReviewPanel /> : null}
        {activeTab === "explorer" ? <ExplorerPanel /> : null}
      </div>
      <nav aria-label={tMobile(locale, "mobile.tabs.label")} data-mobile-tabbar="">
        <div role="tablist" className="flex shrink-0 border-t border-studio-border-subtle bg-studio-panel">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls="mobile-panel-area"
              data-mobile-tab={tab}
              onClick={() => setActiveTab(tab)}
              className={`min-h-[44px] min-w-[44px] flex-1 px-2 text-sm font-medium ${
                activeTab === tab
                  ? "text-studio-accent-text"
                  : "text-studio-muted hover:text-studio-fg"
              }`}
            >
              {tMobile(locale, `mobile.tabs.${tab}`)}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
