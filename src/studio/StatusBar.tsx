"use client";

import { Cpu, Database } from "lucide-react";
import { ENGINE_BUILD_INFO } from "@/src/engine/stockfish-client";
import { explorerSourceTitle } from "@/src/lib/explorer-types";
import { useStudioStore } from "@/src/store/studio-store";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";

export function StatusBar({ message }: { message: string | null }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const source = useStudioStore((state) => state.databaseSource);
  const databases = useStudioStore((state) => state.files.databases);
  const threads = useStudioStore((state) => state.settings.engineThreads);
  const engineLabel = ENGINE_BUILD_INFO[useStudioStore((state) => state.settings.engineBuild)].label;
  const signedIn = useStudioStore((state) => Boolean(state.user));
  const dirty = useStudioStore((state) => state.boards.some((board) => board.dirty));

  const sync = !signedIn
    ? { label: tStudioChrome(locale, "chrome.statusBar.guest"), dot: "bg-studio-disabled" }
    : dirty
      ? { label: tStudioChrome(locale, "chrome.statusBar.saving"), dot: "bg-studio-warning-fg" }
      : { label: tStudioChrome(locale, "chrome.statusBar.synced"), dot: "bg-studio-success" };

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3.5 border-t border-studio-border bg-studio-chrome px-2.5 text-caption text-studio-faint">
      <span role="status" className="min-w-0 truncate text-studio-muted">
        {message}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-3.5">
        <span className="flex items-center gap-1.5">
          <Database size={12} />
          {explorerSourceTitle(source, databases, locale)}
        </span>
        <span className="flex items-center gap-1.5">
          <Cpu size={12} />
          {engineLabel} · {tStudioChrome(locale, threads === 1 ? "chrome.statusBar.threads.one" : "chrome.statusBar.threads.other", { count: threads })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${sync.dot}`} />
          {sync.label}
        </span>
      </span>
    </footer>
  );
}
