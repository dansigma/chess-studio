"use client";

import { X } from "lucide-react";
import { tLibrary } from "@/src/i18n/library-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { MAX_DATABASES, MAX_GAMES_PER_DATABASE } from "@/src/lib/user-files";
import { useStudioStore } from "@/src/store/studio-store";
import { Button, IconButton } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { useImportQueue, type ImportEntry } from "./import-queue-store";

const STATE_KEYS = {
  waiting: "library.import.widget.waiting",
  importing: "library.import.widget.importing",
  done: "library.import.widget.done",
  cancelled: "library.import.widget.cancelled",
  failed: "library.import.widget.failed",
} as const;

function EntryDetail({ entry, locale }: { entry: ImportEntry; locale: SiteLocale }) {
  const fmt = (value: number) => value.toLocaleString(locale);
  const lines: string[] = [];
  if (entry.state === "failed") {
    lines.push(
      entry.error === "database-limit"
        ? tLibrary(locale, "library.import.widget.databaseLimit", { limit: fmt(MAX_DATABASES) })
        : tLibrary(locale, "library.import.widget.readFailed"),
    );
  }
  if (entry.state === "done") {
    lines.push(
      entry.overLimit
        ? tLibrary(locale, "library.import.widget.overLimit", {
            imported: fmt(entry.imported ?? 0),
            over: fmt(entry.overLimit),
            limit: fmt(MAX_GAMES_PER_DATABASE),
          })
        : tLibrary(locale, "library.import.widget.imported", { count: fmt(entry.imported ?? 0) }),
    );
  }
  if ((entry.state === "done" || entry.state === "cancelled") && entry.unreadable) {
    lines.push(tLibrary(locale, "library.import.widget.unreadable", { count: fmt(entry.unreadable) }));
  }
  if (lines.length === 0) {
    return null;
  }
  return (
    <>
      {lines.map((line) => (
        <p key={line} className="text-xs text-studio-muted">
          {line}
        </p>
      ))}
    </>
  );
}

/** Bottom-right import progress; sits inside the Library's relative root. */
export function LibraryImportWidget() {
  const locale = useStudioStore((s) => s.settings.locale);
  const entries = useImportQueue((s) => s.entries);
  const cancel = useImportQueue((s) => s.cancel);
  const dismiss = useImportQueue((s) => s.dismiss);
  if (entries.length === 0) {
    return null;
  }
  const active = entries.some((entry) => entry.state === "waiting" || entry.state === "importing");
  return (
    <Panel
      role="status"
      aria-live="polite"
      aria-label={tLibrary(locale, "library.import.widget.label")}
      data-testid="library-import-widget"
      className="absolute bottom-3 right-3 z-40 flex max-h-[60%] w-[min(22rem,calc(100%-1.5rem))] flex-col gap-2 overflow-auto border border-studio-border p-3 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-dense font-medium text-studio-fg">{tLibrary(locale, "library.import.widget.label")}</span>
        {active ? null : (
          <IconButton size="sm" label={tLibrary(locale, "library.import.widget.close")} onClick={dismiss}>
            <X size={14} />
          </IconButton>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id} data-testid="library-import-entry" data-state={entry.state} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-dense text-studio-fg" title={entry.name}>
                {entry.name}
              </span>
              <span className="shrink-0 text-xs text-studio-muted">{tLibrary(locale, STATE_KEYS[entry.state])}</span>
              {entry.state === "waiting" || entry.state === "importing" ? (
                <Button size="sm" variant="ghost" onClick={() => cancel(entry.id)}>
                  {tLibrary(locale, "library.import.widget.cancel")}
                </Button>
              ) : null}
            </div>
            {entry.state === "importing" ? (
              <>
                <progress
                  className="h-1.5 w-full overflow-hidden rounded-full accent-studio-accent"
                  value={entry.done}
                  max={Math.max(entry.total, 1)}
                  aria-label={entry.name}
                />
                <p className="text-xs text-studio-muted">
                  {tLibrary(locale, "library.import.widget.progress", {
                    done: entry.done.toLocaleString(locale),
                    total: entry.total.toLocaleString(locale),
                  })}
                </p>
              </>
            ) : null}
            <EntryDetail entry={entry} locale={locale} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
