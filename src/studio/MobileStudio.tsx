"use client";

import { useState } from "react";
import { Check, Copy, Link2, Menu } from "lucide-react";
import { BoardPanel } from "./BoardPanel";
import { EnginePanel } from "./EnginePanel";
import { ExplorerPanel } from "./ExplorerPanel";
import { MobileMoveStrip } from "./MobileMoveStrip";
import { NotationPanel } from "./NotationPanel";
import { ReviewPanel } from "./ReviewPanel";
import { BottomSheet } from "./BottomSheet";
import { FileMenuItems } from "./MenuBarFileMenu";
import { EditMenuItems } from "./MenuBarEditMenu";
import { ViewMenuItems } from "./MenuBarViewMenu";
import { SettingsDialog } from "./SettingsDialog";
import { tMobile } from "@/src/i18n/mobile-strings.ts";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { MenuDivider as Divider } from "./ui/Menu";

// SIG-1043: single-column studio layout below 768 px. Rendered inside the
// shell's h-screen column between MenuBar and StatusBar, so this root fills
// the leftover height (flex-1) instead of taking a full viewport of its own.
// The board stays at the top sized to the viewport width; the move strip
// sits directly below.
// SIG-1108: bottom tab bar switches between the existing desktop panels
// (Notation / Engine / Review / Explorer). Only the active panel is mounted
// so the engine and review never run in the background.
// SIG-1109: compact header with a hamburger button opening a bottom sheet
// that reuses the desktop File/Edit/View menu items — the desktop MenuBar is
// hidden on mobile (see StudioShell), so this is the touch entry point for
// Open PGN and the rest of the menus.
const TABS = ["moves", "engine", "review", "explorer"] as const;

export type MobileStudioTab = (typeof TABS)[number];

export function MobileStudio({ onOpenPgn }: { onOpenPgn: () => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [activeTab, setActiveTab] = useState<MobileStudioTab>("moves");
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewSub, setViewSub] = useState<"theme" | "pieces" | "notation" | "panel" | "scheme" | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
    setViewSub(null);
  }

  function run(action: () => void) {
    return () => {
      action();
      closeMenu();
    };
  }

  function handleShare(url: string, copied: boolean) {
    setShareCopied(copied);
    setShareUrl(url);
  }

  async function copyShareUrl() {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  }

  return (
    <div
      data-mobile-studio=""
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-studio-bg"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-studio-border-subtle bg-studio-panel px-2">
        <button
          type="button"
          aria-label={tMobile(locale, "mobile.menu.open")}
          data-mobile-menu-button=""
          onClick={() => setMenuOpen(true)}
          className="grid min-h-[44px] min-w-[44px] place-items-center rounded-md text-studio-fg hover:bg-studio-hover-strong"
        >
          <Menu size={20} />
        </button>
        <span className="truncate text-sm font-medium text-studio-fg">
          {tMobile(locale, "mobile.menu.title")}
        </span>
      </div>
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
      {menuOpen ? (
        <BottomSheet title={tMobile(locale, "mobile.menu.title")} onClose={closeMenu}>
          <div role="menu" aria-label={tMobile(locale, "mobile.menu.title")}>
            <div className="px-1.5 pb-1 pt-2 text-caption font-semibold uppercase tracking-wider text-studio-faint">
              {tStudioChrome(locale, "chrome.menu.file")}
            </div>
            <FileMenuItems onOpenPgn={onOpenPgn} onShare={handleShare} close={closeMenu} run={run} />
            <Divider />
            <div className="px-1.5 pb-1 pt-2 text-caption font-semibold uppercase tracking-wider text-studio-faint">
              {tStudioChrome(locale, "chrome.menu.edit")}
            </div>
            <EditMenuItems run={run} />
            <Divider />
            <div className="px-1.5 pb-1 pt-2 text-caption font-semibold uppercase tracking-wider text-studio-faint">
              {tStudioChrome(locale, "chrome.menu.view")}
            </div>
            <ViewMenuItems
              viewSub={viewSub}
              setViewSub={setViewSub}
              leaveSubmenu={() => setViewSub(null)}
              onOpenSettings={() => {
                closeMenu();
                setSettingsOpen(true);
              }}
              run={run}
              flat
              showPanels={false}
            />
          </div>
        </BottomSheet>
      ) : null}
      {shareUrl ? (
        <Dialog
          title={tStudioChrome(locale, "chrome.share.title")}
          onClose={() => setShareUrl(null)}
          footer={<Button onClick={() => setShareUrl(null)}>{tStudioChrome(locale, "chrome.share.done")}</Button>}
        >
          <p className="mb-3">{tStudioChrome(locale, "chrome.share.body")}</p>
          <div className="flex h-[34px] items-center gap-2 rounded-lg border border-studio-border-strong bg-studio-panel pl-2.5 pr-1 text-studio-faint">
            <Link2 size={14} className="shrink-0" />
            <input
              readOnly
              value={shareUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent text-dense text-studio-fg outline-none"
            />
            <Button size="sm" variant="primary" className="h-[26px]" onClick={() => void copyShareUrl()}>
              {shareCopied ? <Check size={13} /> : <Copy size={13} />}
              {shareCopied ? tStudioChrome(locale, "chrome.share.copied") : tStudioChrome(locale, "chrome.share.copyLink")}
            </Button>
          </div>
        </Dialog>
      ) : null}
      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
