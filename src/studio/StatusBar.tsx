"use client";

import { isSyncPending } from "@/src/store/slices/selectors";
import { useStudioStore } from "@/src/store/studio-store";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";

/** SIG-1197: guest / saving / synced, shared by the status bar and the menubar. */
export function useSyncState(): { label: string; dot: string } {
  const locale = useStudioStore((state) => state.settings.locale);
  const signedIn = useStudioStore((state) => Boolean(state.user));
  const dirty = useStudioStore((state) => state.boards.some(isSyncPending));
  return !signedIn
    ? { label: tStudioChrome(locale, "chrome.statusBar.guest"), dot: "bg-studio-disabled" }
    : dirty
      ? { label: tStudioChrome(locale, "chrome.statusBar.saving"), dot: "bg-studio-warning-fg" }
      : { label: tStudioChrome(locale, "chrome.statusBar.synced"), dot: "bg-studio-success" };
}

/**
 * SIG-1197: desktop replacement for the status bar's message slot. The
 * live region is always mounted so screen readers hear each new message;
 * the pill only shows while there is one (StudioShell clears it after 3s).
 */
export function StatusToast({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[1050] -translate-x-1/2"
    >
      {message ? (
        <span className="block max-w-[min(32rem,90vw)] truncate rounded-full border border-studio-border-strong bg-studio-elevated px-3 py-1.5 text-dense text-studio-fg shadow-2xl">
          {message}
        </span>
      ) : null}
    </div>
  );
}

export function StatusBar({ message }: { message: string | null }) {
  const sync = useSyncState();

  return (
    <footer className="flex h-[calc(1.5rem+env(safe-area-inset-bottom))] shrink-0 items-center gap-3 border-t border-studio-border bg-studio-chrome px-2.5 pb-[env(safe-area-inset-bottom)] text-caption text-studio-faint">
      <span role="status" className="min-w-0 flex-1 truncate text-studio-muted">
        {message}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${sync.dot}`} />
        {sync.label}
      </span>
    </footer>
  );
}
