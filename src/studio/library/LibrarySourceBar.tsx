"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { tLibrary } from "@/src/i18n/library-strings";
import { MASTERS_SOURCE_ID } from "@/src/lib/library/masters-source";
import { getLibrarySource, listLibrarySources } from "@/src/lib/library/sources";
import { defaultLibraryFilters, type LibrarySourceId } from "@/src/lib/library/types";
import { useStudioStore } from "@/src/store/studio-store";
import { Chip } from "../ui/Controls";
import { formatGameCount } from "./filter-chips";
import { selectAll, selectOnly, toggleSource } from "./library-sources";
import { useLibraryStore } from "./library-store";

export type LibrarySourceBarProps = {
  sourceErrors: Partial<Record<LibrarySourceId, string>>;
};

/** My Games total, fetched once per mount; null while loading, on error or signed out. */
function useMyGamesCount(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const controller = new AbortController();
    const adapter = getLibrarySource("my-games");
    if (!adapter) {
      return;
    }
    void (async () => {
      try {
        const page = await adapter.list(defaultLibraryFilters(["my-games"]), null, 1, controller.signal);
        if (!controller.signal.aborted && typeof page.total === "number") {
          setCount(page.total);
        }
      } catch {
        // Signed out or offline: show the card without a count.
      }
    })();
    return () => controller.abort();
  }, [enabled]);
  return count;
}

/** SIG-1319: one card per source, grouped; click selects one, Ctrl/⌘-click toggles. */
export function LibrarySourceBar({ sourceErrors }: LibrarySourceBarProps) {
  const locale = useStudioStore((s) => s.settings.locale);
  const databases = useStudioStore((s) => s.files.databases);
  const selected = useLibraryStore((s) => s.filters.sources);
  const setSources = useLibraryStore((s) => s.setSources);
  // The adapter registry is not reactive; `databases` changes re-render this.
  const adapters = listLibrarySources();
  const ids = adapters.map((adapter) => adapter.id);
  const hasMyGames = ids.includes("my-games");
  const myGamesCount = useMyGamesCount(hasMyGames);
  const selectedAvailable = ids.filter((id) => selected.includes(id));
  const allSelected = selectedAvailable.length === ids.length;

  const count = (id: LibrarySourceId): string | null => {
    if (id === MASTERS_SOURCE_ID) {
      return tLibrary(locale, "library.sources.mastersLimit");
    }
    let total: number | null = null;
    if (id === "my-games") {
      total = myGamesCount;
    } else if (id.startsWith("file:")) {
      const db = databases.find((database) => `file:${database.id}` === id);
      total = db ? db.games.length : null;
    }
    return total === null ? null : tLibrary(locale, "library.sources.games", { count: formatGameCount(total, locale) });
  };

  const click = (id: LibrarySourceId) => (event: MouseEvent) => {
    setSources(event.ctrlKey || event.metaKey ? toggleSource(selected, id, ids) : selectOnly(id));
  };

  const card = (id: LibrarySourceId) => {
    const adapter = adapters.find((item) => item.id === id);
    if (!adapter) {
      return null;
    }
    const isSelected = selected.includes(id);
    const isLast = isSelected && selectedAvailable.length <= 1;
    const error = sourceErrors[id];
    const detail = count(id);
    return (
      <button
        key={id}
        type="button"
        data-testid="library-source-card"
        aria-pressed={isSelected}
        title={isLast ? tLibrary(locale, "library.sources.lastGuard") : undefined}
        onClick={click(id)}
        className={`flex h-9 shrink-0 flex-col items-start justify-center rounded-md border px-2.5 text-left ${
          isSelected
            ? "border-studio-accent bg-studio-accent-soft text-studio-accent-text"
            : "border-studio-border bg-studio-hover-subtle text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
        }`}
      >
        <span className="flex max-w-48 items-center gap-1 text-dense font-medium leading-tight">
          <span className="truncate">{adapter.label(locale)}</span>
          {error !== undefined ? (
            <span
              role="img"
              title={tLibrary(locale, "library.sources.failed", { message: error })}
              aria-label={tLibrary(locale, "library.sources.failed", { message: error })}
              className="text-studio-danger"
            >
              <TriangleAlert size={12} />
            </span>
          ) : null}
        </span>
        {detail !== null ? <span className="text-caption leading-tight tabular-nums opacity-80">{detail}</span> : null}
      </button>
    );
  };

  const publicIds = ids.filter((id) => id === MASTERS_SOURCE_ID);
  const mineIds = ids.filter((id) => id !== MASTERS_SOURCE_ID);
  // My Games first, then the PGN files in registration order.
  mineIds.sort((a, b) => Number(b === "my-games") - Number(a === "my-games"));

  const group = (key: "library.sources.group.public" | "library.sources.group.mine", groupIds: LibrarySourceId[]): ReactNode =>
    groupIds.length === 0 ? null : (
      <div role="group" aria-label={tLibrary(locale, key)} className="flex shrink-0 items-center gap-1.5">
        <span className="text-caption font-semibold uppercase tracking-wide text-studio-faint">
          {tLibrary(locale, key)}
        </span>
        {groupIds.map(card)}
      </div>
    );

  return (
    <div
      role="group"
      aria-label={tLibrary(locale, "library.sources.barLabel")}
      data-testid="library-source-bar"
      className="flex min-w-0 shrink-0 items-center gap-3 overflow-x-auto px-0.5 pb-1"
    >
      <Chip active={allSelected} onClick={() => setSources(selectAll(ids))}>
        {tLibrary(locale, "library.sources.selectAll")}
      </Chip>
      {group("library.sources.group.public", publicIds)}
      {group("library.sources.group.mine", mineIds)}
    </div>
  );
}
