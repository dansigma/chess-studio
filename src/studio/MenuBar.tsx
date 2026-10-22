"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Copy, Link2 } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { selectDirtyCount, useStudioStore } from "@/src/store/studio-store";
import { SITE_NAME, siteSections } from "@/src/site/sections";
import { LocaleSwitcher } from "@/src/i18n/LocaleSwitcher";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { MenuDivider as Divider, MenuItem as Item, MenuSurface } from "./ui/Menu";
import { BrandLockup } from "./ui/BrandLockup";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { SettingsDialog } from "./SettingsDialog";
import { MenuBarFileMenu } from "./MenuBarFileMenu";
import { MenuBarEditMenu } from "./MenuBarEditMenu";
import { MenuBarViewMenu } from "./MenuBarViewMenu";

type MenuKey = "file" | "edit" | "view" | "help" | "account" | null;
type ViewSubmenu = "theme" | "pieces" | "notation" | "panel" | "scheme" | null;

const TOP_MENUS = [
  ["file", "chrome.menu.file"],
  ["edit", "chrome.menu.edit"],
  ["view", "chrome.menu.view"],
  ["help", "chrome.menu.help"],
] as const;

function initials(email: string): string {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return letters.toUpperCase() || "?";
}

export function MenuBar({
  onOpenPgn,
}: {
  onOpenPgn: () => void;
}) {
  const [open, setOpen] = useState<MenuKey>(null);
  const [viewSub, setViewSub] = useState<ViewSubmenu>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const router = useRouter();
  // SIG-857: root subscribes narrowly — only the account pill (user/email,
  // boardCount, dirtyCount), the help item (setAboutOpen), and the site nav
  // locale (SIG-962) need store values here. File/edit/view menus own their
  // subscriptions in MenuBarFileMenu/MenuBarEditMenu/MenuBarViewMenu, so the
  // closed menubar no longer re-renders on board or unrelated settings changes
  // (locale changes do re-render the nav labels, by design).
  const setActivity = useStudioStore((state) => state.setActivity);
  const boardCount = useStudioStore((state) => state.boards.length);
  const dirtyCount = useStudioStore(selectDirtyCount);
  const user = useStudioStore((state) => state.user);
  const setAboutOpen = useStudioStore((state) => state.setAboutOpen);
  const locale = useStudioStore((state) => state.settings.locale);

  function close() {
    setOpen(null);
    setViewSub(null);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(null);
      setViewSub(null);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

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

  function toggleMenu(key: Exclude<MenuKey, null>) {
    setViewSub(null);
    setOpen(open === key ? null : key);
  }

  function run(action: () => void) {
    return () => {
      action();
      close();
    };
  }

  const leaveSubmenu = () => setViewSub(null);

  function handleShare(url: string, copied: boolean) {
    setShareCopied(copied);
    setShareUrl(url);
  }

  function menuContent(key: (typeof TOP_MENUS)[number][0]) {
    if (key === "file") {
      return (
        <MenuBarFileMenu onOpenPgn={onOpenPgn} onShare={handleShare} close={close} run={run} />
      );
    }
    if (key === "edit") {
      return <MenuBarEditMenu run={run} />;
    }
    if (key === "view") {
      return (
        <MenuBarViewMenu
          viewSub={viewSub}
          setViewSub={setViewSub}
          leaveSubmenu={leaveSubmenu}
          onOpenSettings={() => setSettingsOpen(true)}
          run={run}
        />
      );
    }
    return <Item label={tStudioChrome(locale, "chrome.menu.aboutSite", { site: SITE_NAME })} onClick={run(() => setAboutOpen(true))} />;
  }

  return (
    <div className="relative z-[1000] flex h-9 items-center gap-0.5 border-b border-studio-border bg-studio-chrome px-2 text-body text-studio-fg">
      <span className="mr-3 px-1.5">
        <BrandLockup />
      </span>
      {siteSections(locale).filter((section) => section.href !== "/studio").map((section) => (
        <a
          key={section.href}
          href={section.href}
          className="relative z-20 mr-1 rounded-md px-2 py-0.5 text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
        >
          {section.label}
        </a>
      ))}

      {open ? (
        <button className="fixed inset-0 z-10 cursor-default" onClick={close} aria-label={tStudioChrome(locale, "chrome.menu.closeMenu")} />
      ) : null}

      {TOP_MENUS.map(([key, labelKey]) => (
        <div key={key} className="relative z-20">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === key}
            className={`h-[26px] rounded-md px-2.5 ${
              open === key
                ? "bg-studio-hover-strong text-studio-fg"
                : "text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
            }`}
            onClick={() => toggleMenu(key)}
            onMouseEnter={() => {
              if (open && open !== key && open !== "account") {
                setViewSub(null);
                setOpen(key);
              }
            }}
          >
            {tStudioChrome(locale, labelKey)}
          </button>
          {open === key ? (
            <MenuSurface className="absolute left-0 top-[calc(100%+5px)]" onClose={close}>
              {menuContent(key)}
            </MenuSurface>
          ) : null}
        </div>
      ))}

      <div className="relative z-20 ml-auto flex items-center gap-2">
        <LocaleSwitcher />
        {user?.email ? (
          <>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={open === "account"}
              onClick={() => toggleMenu("account")}
              className={`inline-flex h-[26px] items-center gap-2 rounded-full border border-studio-border pl-[3px] pr-2 text-dense ${
                open === "account" ? "bg-studio-hover text-studio-fg" : "text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
              }`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-studio-accent-soft text-[10px] font-bold text-studio-accent-text">
                {initials(user.email)}
              </span>
              <span className="max-w-40 truncate">{user.email}</span>
              <ChevronDown size={13} />
            </button>
            {open === "account" ? (
              <MenuSurface className="absolute right-0 top-[calc(100%+5px)] min-w-60" onClose={close}>
                <div className="px-2 pb-1.5 pt-2">
                  <div className="truncate font-medium text-studio-fg">{user.email}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-caption text-studio-faint">
                    <span className={`h-1.5 w-1.5 rounded-full ${dirtyCount ? "bg-studio-warning-fg" : "bg-studio-success"}`} />
                    {dirtyCount
                      ? tStudioChrome(locale, dirtyCount === 1 ? "chrome.account.waitingToSync.one" : "chrome.account.waitingToSync.other", { count: dirtyCount })
                      : tStudioChrome(locale, "chrome.account.allSynced")}
                  </div>
                </div>
                <Divider />
                <Item label={tStudioChrome(locale, "chrome.account.myBoards")} shortcut={String(boardCount)} onClick={run(() => setActivity("boards"))} />
                <Item label={tStudioChrome(locale, "chrome.account.settings")} onClick={run(() => setSettingsOpen(true))} />
                <Divider />
                <Item
                  label={tStudioChrome(locale, "chrome.account.signOut")}
                  danger
                  onClick={run(() => {
                    void (async () => {
                      await createBrowserSupabase()?.auth.signOut();
                      await signOut();
                    })();
                  })}
                />
              </MenuSurface>
            ) : null}
          </>
        ) : (
          <Button size="sm" variant="ghost" className="border border-studio-border" onClick={() => router.push("/login")}>
            {tStudioChrome(locale, "chrome.account.signIn")}
          </Button>
        )}
      </div>

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
