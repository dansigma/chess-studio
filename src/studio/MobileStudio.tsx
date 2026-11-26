"use client";

import { useState, type CSSProperties } from "react";
import { ArrowLeft, Check, ChevronDown, Copy, Link2, Menu, Radio } from "lucide-react";
import { BoardPanel } from "./BoardPanel";
import { MATERIAL_STRIPS_HEIGHT } from "./MaterialBoardLayout";
import { BoardsSidebar } from "./BoardsSidebar";
import { BookmarksSidebar } from "./BookmarksSidebar";
import { EnginePanel } from "./EnginePanel";
import { ExplorerPanel } from "./ExplorerPanel";
import { FileGamesPanel } from "./FileGamesPanel";
import { MobileMoveStrip } from "./MobileMoveStrip";
import { MyGamesSidebar } from "./MyGamesSidebar";
import { NotationPanel } from "./NotationPanel";
import { PositionInsightsPanel } from "./PositionInsightsPanel";
import { RepertoirePanel } from "./RepertoirePanel";
import { ReviewPanel } from "./ReviewPanel";
import { BottomSheet } from "./BottomSheet";
import { MobileMenuSheet } from "./MobileMenuSheet";
import { SettingsDialog } from "./SettingsDialog";
import { boardTitle } from "./dock-api";
import { tMobile } from "@/src/i18n/mobile-strings.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { textSizeAttr } from "./text-size";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { LiveView } from "./live/LiveView";
import { useLiveStore } from "./live/live-store";
import { LibraryView } from "./library/LibraryView";
import { openPlayerDossier } from "./library/dossier/open-player-dossier";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";

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
const TABS = ["moves", "engine", "review", "explorer", "more"] as const;

export type MobileStudioTab = (typeof TABS)[number];

export function MobileStudio({
  onOpenPgn,
  fileGamesOpen = false,
  onCloseFileGames,
  onShowFileGames,
}: {
  onOpenPgn: () => void;
  fileGamesOpen?: boolean;
  onCloseFileGames?: () => void;
  onShowFileGames?: () => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const textSize = useStudioStore((state) => state.settings.textSize);
  const showMaterialBalance = useStudioStore((state) => state.settings.showMaterialBalance);
  const boards = useStudioStore((state) => state.boards);
  const activeBoard = useStudioStore(selectActiveBoard);
  const workspaceView = useStudioStore((state) => state.workspaceView);
  const setWorkspaceView = useStudioStore((state) => state.setWorkspaceView);
  const toggleLive = useStudioStore((state) => state.toggleLive);
  const hasActiveLive = useLiveStore((state) => state.tableRoundId !== null || state.openBoards.length > 0);
  const settingsDialog = useStudioStore((state) => state.settingsDialog);
  const openSettings = useStudioStore((state) => state.openSettings);
  const closeSettings = useStudioStore((state) => state.closeSettings);
  const [activeTab, setActiveTab] = useState<MobileStudioTab>("moves");
  const [moreTool, setMoreTool] = useState<"insights" | "repertoire">("insights");
  const [menuOpen, setMenuOpen] = useState(false);
  const [boardsSheetOpen, setBoardsSheetOpen] = useState(false);
  const [boardsSheetTab, setBoardsSheetTab] = useState<"boards" | "mygames" | "bookmarks">("boards");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
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
        {workspaceView === "library" || workspaceView === "live" ? (
          <>
            <button
              type="button"
              data-mobile-back-board=""
              aria-label={tMobile(locale, "mobile.topbar.backToBoard")}
              onClick={() => setWorkspaceView("studio")}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-studio-accent-text hover:bg-studio-hover-strong"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>{tMobile(locale, "mobile.topbar.board")}</span>
            </button>
            <span className="truncate text-sm font-medium text-studio-fg">
              {tStudioChrome(locale, workspaceView === "library" ? "chrome.activity.library" : "chrome.activity.live")}
            </span>
          </>
        ) : (
          <button
            type="button"
            data-mobile-board-switcher=""
            // The accessible name keeps the visible title and count (WCAG 2.5.3).
            aria-label={
              boards.length > 1
                ? tMobile(locale, "mobile.boards.switchMany", {
                    title: boardTitle(locale, activeBoard.title),
                    count: boards.length,
                  })
                : tMobile(locale, "mobile.boards.switch", { title: boardTitle(locale, activeBoard.title) })
            }
            onClick={() => setBoardsSheetOpen(true)}
            className="flex min-h-[44px] min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-sm font-medium text-studio-fg hover:bg-studio-hover-strong"
          >
            <span className="truncate">{boardTitle(locale, activeBoard.title)}</span>
            {boards.length > 1 ? (
              <span
                data-mobile-board-count=""
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-studio-accent-soft px-1.5 text-[11px] font-semibold text-studio-accent-text"
              >
                {boards.length}
              </span>
            ) : null}
            <ChevronDown size={14} className="shrink-0 text-studio-muted" aria-hidden="true" />
          </button>
        )}
        {hasActiveLive && workspaceView !== "live" ? (
          <button
            type="button"
            data-mobile-live-indicator=""
            aria-label={tStudioChrome(locale, "chrome.activity.live")}
            onClick={toggleLive}
            className="ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-studio-border bg-studio-bg px-2.5 text-xs font-medium text-studio-fg hover:bg-studio-hover-strong"
          >
            <span className="h-2 w-2 rounded-full bg-studio-success" aria-hidden="true" />
            <Radio size={14} aria-hidden="true" />
            <span>{tStudioChrome(locale, "chrome.activity.live")}</span>
          </button>
        ) : null}
      </div>
      {workspaceView === "library" ? (
        <div data-mobile-library="" className="min-h-0 flex-1 overflow-auto p-1.5">
          <LibraryView />
        </div>
      ) : workspaceView === "live" ? (
        <div data-mobile-live="" className="min-h-0 flex-1 overflow-auto p-1.5">
          <LiveView />
        </div>
      ) : (
        <>
      <div className="w-full shrink-0 bg-studio-panel [container-type:inline-size]">
        <div
          className="aspect-square w-full"
          style={showMaterialBalance ? { height: `calc(100cqw + ${MATERIAL_STRIPS_HEIGHT})` } : undefined}
        >
          <BoardPanel mobile />
        </div>
      </div>
      <MobileMoveStrip />
      <div data-mobile-panel-area="" data-text-size={textSizeAttr(textSize)} id="mobile-panel-area" className="min-h-0 flex-1 overflow-auto">
        {activeTab === "moves" ? <NotationPanel /> : null}
        {activeTab === "engine" ? <EnginePanel /> : null}
        {activeTab === "review" ? <ReviewPanel /> : null}
        {activeTab === "explorer" ? <ExplorerPanel /> : null}
        {activeTab === "more" ? (
          <div className="flex h-full min-h-0 flex-col">
            <div
              role="tablist"
              aria-label={tMobile(locale, "mobile.more.label")}
              className="flex shrink-0 gap-1 border-b border-studio-border-subtle bg-studio-panel px-2 py-1"
            >
              {(["insights", "repertoire"] as const).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  role="tab"
                  aria-selected={moreTool === tool}
                  data-mobile-more-tool={tool}
                  onClick={() => setMoreTool(tool)}
                  className={`min-h-[44px] flex-1 rounded-md px-3 text-sm font-medium ${
                    moreTool === tool
                      ? "bg-studio-accent-soft text-studio-accent-text"
                      : "text-studio-muted hover:text-studio-fg"
                  }`}
                >
                  {tPanels(locale, tool === "insights" ? "panels.insights" : "panels.repertoire")}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {moreTool === "insights" ? <PositionInsightsPanel /> : <RepertoirePanel />}
            </div>
          </div>
        ) : null}
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
              className={`min-h-[44px] min-w-[44px] flex-1 px-1.5 text-xs font-medium sm:text-sm ${
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
        </>
      )}
      {menuOpen ? (
        <MobileMenuSheet
          onOpenPgn={onOpenPgn}
          onShowFileGames={onShowFileGames}
          onShare={handleShare}
          onOpenSettings={() => {
            closeMenu();
            openSettings();
          }}
          onClose={closeMenu}
        />
      ) : null}
      {boardsSheetOpen ? (
        <BottomSheet title={tMobile(locale, "mobile.boards.sheetTitle")} onClose={() => setBoardsSheetOpen(false)}>
          <div
            role="tablist"
            aria-label={tMobile(locale, "mobile.boards.sheetTitle")}
            className="mb-2 flex gap-1 rounded-lg bg-studio-panel p-1"
          >
            {(
              [
                ["boards", "chrome.activity.boards"],
                ["mygames", "chrome.activity.mygames"],
                ["bookmarks", "chrome.activity.bookmarks"],
              ] as const
            ).map(([tabId, labelKey]) => (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={boardsSheetTab === tabId}
                data-mobile-boards-tab={tabId}
                onClick={() => setBoardsSheetTab(tabId)}
                className={`min-h-[44px] flex-1 rounded-md px-2 text-xs font-medium ${
                  boardsSheetTab === tabId
                    ? "bg-studio-accent-soft text-studio-accent-text"
                    : "text-studio-muted hover:text-studio-fg"
                }`}
              >
                {tStudioChrome(locale, labelKey)}
              </button>
            ))}
          </div>
          <div style={{ "--sidebar-width": "100%" } as CSSProperties}>
            {boardsSheetTab === "boards" ? (
              <BoardsSidebar mobile onSelect={() => setBoardsSheetOpen(false)} />
            ) : boardsSheetTab === "mygames" ? (
              <MyGamesSidebar showStats={false} onOpenGame={() => setBoardsSheetOpen(false)} />
            ) : (
              // The player panels live in the desktop dock only: on a phone a
              // bookmark opens the Library player dossier instead.
              <BookmarksSidebar
                onOpenPlayer={(player, color) => {
                  setBoardsSheetOpen(false);
                  openPlayerDossier(player, color);
                }}
              />
            )}
          </div>
        </BottomSheet>
      ) : null}
      {fileGamesOpen ? (
        <BottomSheet
          title={tPanels(locale, "panels.fileGames")}
          onClose={() => onCloseFileGames?.()}
        >
          <div data-mobile-file-games="" className="-mx-4">
            <FileGamesPanel
              mobile
              onGameSelect={() => {
                // Opened from Library or Live, the chosen game must be on screen.
                setWorkspaceView("studio");
                onCloseFileGames?.();
              }}
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
      {settingsDialog.open ? (
        <SettingsDialog
          initialSection={settingsDialog.section ?? undefined}
          onClose={closeSettings}
        />
      ) : null}
    </div>
  );
}
