"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { accountInitials } from "@/src/lib/account-initials";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";
import { MenuDivider as Divider, MenuItem as Item, MenuSurface } from "./ui/Menu";

/**
 * Shared account avatar / sign-in trigger and menu surface used by both the
 * Studio MenuBar and the site-wide SiteHeader. Studio-only board sync status
 * and the "My boards" shortcut appear only when `onOpenBoards` is supplied.
 */
export function AccountMenu({
  open,
  onToggle,
  onClose,
  onOpenSettings,
  dirtyCount = 0,
  boardCount,
  onOpenBoards,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
  dirtyCount?: number;
  boardCount?: number;
  onOpenBoards?: () => void;
}) {
  const router = useRouter();
  const user = useStudioStore((state) => state.user);
  const locale = useStudioStore((state) => state.settings.locale);
  const showStudioItems = Boolean(onOpenBoards);

  if (!user?.email) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0 whitespace-nowrap border border-studio-border"
        onClick={() => router.push("/login")}
      >
        {tStudioChrome(locale, "chrome.account.signIn")}
      </Button>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // SIG-1215: initials only — the e-mail stays out of the bar (and
        // out of screenshots); it is in the tooltip and the menu header.
        // SIG-1216: with a display name the tooltip is "Name · email".
        aria-label={
          user.displayName
            ? tStudioChrome(locale, "chrome.account.labelNamed", { name: user.displayName, email: user.email })
            : tStudioChrome(locale, "chrome.account.label", { email: user.email })
        }
        title={user.displayName ? `${user.displayName} · ${user.email}` : user.email}
        onClick={onToggle}
        className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full ${
          open ? "ring-2 ring-studio-border-strong" : "hover:ring-2 hover:ring-studio-border"
        }`}
      >
        <span className="relative grid h-[26px] w-[26px] place-items-center rounded-full bg-studio-accent-soft text-[11px] font-bold text-studio-accent-text">
          {accountInitials(user.displayName, user.email)}
          {/* SIG-1198: no "Synced" label — synced is the normal state. Only
              pending changes get a signal: an amber dot on the avatar. */}
          {showStudioItems && dirtyCount ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-studio-warning-fg ring-2 ring-studio-bg"
              title={tStudioChrome(
                locale,
                dirtyCount === 1 ? "chrome.account.waitingToSync.one" : "chrome.account.waitingToSync.other",
                { count: dirtyCount },
              )}
            />
          ) : null}
        </span>
      </button>
      {open ? (
        <MenuSurface
          className="absolute right-0 top-[calc(100%+5px)] min-w-60 max-w-[calc(100vw-1.5rem)]"
          onClose={onClose}
        >
          <div className="px-2 pb-1.5 pt-2">
            {user.displayName ? (
              <>
                <div className="truncate font-medium text-studio-fg">{user.displayName}</div>
                <div className="truncate text-caption text-studio-muted">{user.email}</div>
              </>
            ) : (
              <div className="truncate font-medium text-studio-fg">{user.email}</div>
            )}
            {showStudioItems ? (
              <div className="mt-0.5 flex items-center gap-1.5 text-caption text-studio-faint">
                <span className={`h-1.5 w-1.5 rounded-full ${dirtyCount ? "bg-studio-warning-fg" : "bg-studio-success"}`} />
                {dirtyCount
                  ? tStudioChrome(
                      locale,
                      dirtyCount === 1 ? "chrome.account.waitingToSync.one" : "chrome.account.waitingToSync.other",
                      { count: dirtyCount },
                    )
                  : tStudioChrome(locale, "chrome.account.allSynced")}
              </div>
            ) : null}
          </div>
          <Divider />
          {onOpenBoards ? (
            <Item
              label={tStudioChrome(locale, "chrome.account.myBoards")}
              shortcut={boardCount !== undefined ? String(boardCount) : undefined}
              onClick={() => {
                onOpenBoards();
                onClose();
              }}
            />
          ) : null}
          <Item
            label={tStudioChrome(locale, "chrome.account.settings")}
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
          />
          <Divider />
          <Item
            label={tStudioChrome(locale, "chrome.account.signOut")}
            danger
            onClick={() => {
              onClose();
              void (async () => {
                await createBrowserSupabase()?.auth.signOut();
                useStudioStore.getState().setUser(null);
                const { signOut } = await import("@/app/login/actions");
                await signOut();
              })();
            }}
          />
        </MenuSurface>
      ) : null}
    </>
  );
}
