"use client";

import { useState } from "react";
import Link from "next/link";
import { AccountIdentity, signOutEverywhere } from "./AccountMenu";
import { AccountSection } from "./AccountSection";
import { BottomSheet } from "./BottomSheet";
import { SiteNavLinks } from "./SiteNavLinks";
import { FileMenuItems } from "./MenuBarFileMenu";
import { EditMenuItems } from "./MenuBarEditMenu";
import { ViewMenuItems } from "./MenuBarViewMenu";
import { tMobile } from "@/src/i18n/mobile-strings.ts";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { selectDirtyCount, useStudioStore } from "@/src/store/studio-store";
import { MenuDivider as Divider, MenuItem as Item } from "./ui/Menu";

type ViewSubmenu = "theme" | "pieces" | "notation" | "panel" | "scheme" | "layouts" | null;

// SIG-1109: bottom sheet behind the mobile hamburger button, reusing the
// desktop File/Edit/View menu items. SIG-1383: factored out of MobileStudio
// so the sheet (and its Help entry) is testable without mounting the panels.
// The share/settings dialogs stay in MobileStudio — they must survive the
// sheet closing, so their state cannot live here.
export function MobileMenuSheet({
  onOpenPgn,
  onShowFileGames,
  onShare,
  onOpenSettings,
  onClose,
}: {
  onOpenPgn: () => void;
  onShowFileGames?: () => void;
  onShare: (url: string, copied: boolean) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const setShortcutsOpen = useStudioStore((state) => state.setShortcutsOpen);
  const user = useStudioStore((state) => state.user);
  const dirtyCount = useStudioStore(selectDirtyCount);
  const [viewSub, setViewSub] = useState<ViewSubmenu>(null);

  function run(action: () => void) {
    return () => {
      action();
      onClose();
    };
  }

  return (
    <BottomSheet title={tMobile(locale, "mobile.menu.title")} onClose={onClose}>
      {/* SIG-1202: site navigation sits above the menu sections so Courses
          and Puzzles are reachable in two taps from anywhere in /studio. */}
      <SiteNavLinks onNavigate={onClose} />
      <Divider />
      {/* SIG-1408: account and sign-in, which the desktop menubar avatar covers. */}
      <div data-mobile-account-section="" className="px-1.5 py-2">
        <div className="pb-1.5 text-caption font-semibold uppercase tracking-wider text-studio-faint">
          {tStudioChrome(locale, "chrome.settings.account")}
        </div>
        {user?.email ? (
          <div className="space-y-2">
            <div className="text-sm">
              <AccountIdentity dirtyCount={dirtyCount} />
            </div>
            <AccountSection />
            <button
              type="button"
              onClick={() => {
                onClose();
                void signOutEverywhere();
              }}
              className="flex min-h-[44px] w-full items-center justify-center rounded-md border border-studio-border px-3 text-sm font-medium text-studio-danger hover:bg-studio-hover-strong"
            >
              {tStudioChrome(locale, "chrome.account.signOut")}
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            onClick={onClose}
            className="flex min-h-[44px] w-full items-center justify-center rounded-md border border-studio-border bg-studio-panel px-3 text-sm font-medium text-studio-fg hover:bg-studio-hover-strong"
          >
            {tStudioChrome(locale, "chrome.account.signIn")}
          </Link>
        )}
      </div>
      <Divider />
      <div role="menu" aria-label={tMobile(locale, "mobile.menu.title")}>
        <div className="px-1.5 pb-1 pt-2 text-caption font-semibold uppercase tracking-wider text-studio-faint">
          {tStudioChrome(locale, "chrome.menu.file")}
        </div>
        <FileMenuItems onOpenPgn={onOpenPgn} onShowFileGames={onShowFileGames} onShare={onShare} close={onClose} run={run} />
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
          onOpenSettings={onOpenSettings}
          run={run}
          flat
          showPanels={false}
        />
        {/* SIG-1383: same Help entry as the desktop menubar — the dialog
            itself is rendered once by StudioShell off `shortcutsOpen`. */}
        <Divider />
        <div className="px-1.5 pb-1 pt-2 text-caption font-semibold uppercase tracking-wider text-studio-faint">
          {tStudioChrome(locale, "chrome.menu.help")}
        </div>
        <Item
          label={tStudioChrome(locale, "chrome.shortcuts.open")}
          onClick={run(() => setShortcutsOpen(true))}
        />
      </div>
    </BottomSheet>
  );
}
