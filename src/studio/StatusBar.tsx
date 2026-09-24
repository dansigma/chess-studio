"use client";

import { Cpu, Database } from "lucide-react";
import { explorerSourceTitle } from "@/src/lib/explorer-types";
import { useStudioStore } from "@/src/store/studio-store";

export function StatusBar({ message }: { message: string | null }) {
  const source = useStudioStore((state) => state.databaseSource);
  const databases = useStudioStore((state) => state.files.databases);
  const threads = useStudioStore((state) => state.settings.engineThreads);
  const signedIn = useStudioStore((state) => Boolean(state.user));
  const dirty = useStudioStore((state) => state.boards.some((board) => board.dirty));

  const sync = !signedIn
    ? { label: "Guest · not synced", dot: "bg-studio-disabled" }
    : dirty
      ? { label: "Saving…", dot: "bg-studio-warning-fg" }
      : { label: "Synced", dot: "bg-studio-success" };

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3.5 border-t border-studio-border bg-studio-chrome px-2.5 text-caption text-studio-faint">
      <span role="status" className="min-w-0 truncate text-studio-muted">
        {message}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-3.5">
        <span className="flex items-center gap-1.5">
          <Database size={12} />
          {explorerSourceTitle(source, databases)}
        </span>
        <span className="flex items-center gap-1.5">
          <Cpu size={12} />
          Stockfish 19 lite · {threads} thread{threads === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${sync.dot}`} />
          {sync.label}
        </span>
      </span>
    </footer>
  );
}
