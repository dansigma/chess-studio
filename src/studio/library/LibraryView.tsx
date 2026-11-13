"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useStudioStore } from "@/src/store/studio-store";
import { tLibrary } from "@/src/i18n/library-strings";
import { Panel } from "../ui/Panel";
import { hasActiveFilters, useLibraryStore } from "./library-store";
import { useLibraryGames, type LibraryGamesState } from "./use-library-games";
import { LibraryToolbar } from "./LibraryToolbar";
import { LibrarySourceBar } from "./LibrarySourceBar";
import { LibraryOverviewBar } from "./LibraryOverviewBar";
import { useLibrarySources } from "./library-sources";
import { useMyGamesIndexing, type MyGamesIndexingState } from "./use-my-games-indexing";
import {
  DEFAULT_LIBRARY_SPLIT,
  clampLibrarySplit,
  readLibrarySplit,
  writeLibrarySplit,
} from "./library-layout";
import { LibraryTable } from "./LibraryTable";
import type { LibraryGameItem } from "@/src/lib/library/types";
import { LibraryPreview } from "./LibraryPreview";
import { LibraryPlayers } from "./LibraryPlayers";

const SKELETON_ROWS = 8;

/** SIG-1274: slots filled by 4/10 (table), 5/10 (toolbar) and 9/10 (preview). */
export type LibraryViewSlots = {
  toolbar?: ReactNode;
  table?: (games: LibraryGamesState) => ReactNode;
  preview?: (selected: LibraryGameItem | null) => ReactNode;
};

export function LibraryView(slots: LibraryViewSlots = {}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const mode = useLibraryStore((s) => s.mode);
  const setMode = useLibraryStore((s) => s.setMode);
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1.5 bg-studio-bg p-1.5" data-testid="library-view">
      <div role="tablist" aria-label={tLibrary(locale, "library.mode.label")} className="flex shrink-0 gap-1">
        {(["games", "players"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            onClick={() => setMode(item)}
            className={`rounded px-2.5 py-1 text-dense ${mode === item ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
          >
            {tLibrary(locale, item === "games" ? "library.mode.games" : "library.mode.players")}
          </button>
        ))}
      </div>
      {mode === "players" ? <LibraryPlayers /> : <LibraryGames {...slots} />}
    </div>
  );
}

function LibraryGames({ toolbar, table, preview }: LibraryViewSlots) {
  useLibrarySources();
  const locale = useStudioStore((state) => state.settings.locale);
  const selectedKey = useLibraryStore((s) => s.selectedKey);
  const games = useLibraryGames();
  const filters = useLibraryStore((s) => s.filters);
  const indexing = useMyGamesIndexing(
    filters.position !== null && filters.sources.includes("my-games"),
    games.retry,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [split, setSplit] = useState(DEFAULT_LIBRARY_SPLIT);

  useEffect(() => {
    // Read after mount so server and first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSplit(readLibrarySplit());
  }, []);

  const applySplit = useCallback((value: number, persist: boolean) => {
    const next = clampLibrarySplit(value);
    setSplit(next);
    if (persist) {
      writeLibrarySplit(next);
    }
  }, []);

  const selected = games.items.find((item) => item.key === selectedKey) ?? null;
  const dragging = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!dragging.current || !rect || rect.width === 0) {
      return;
    }
    applySplit(((event.clientX - rect.left) / rect.width) * 100, false);
  };
  const endDrag = () => {
    if (dragging.current) {
      dragging.current = false;
      setSplit((current) => {
        writeLibrarySplit(current);
        return current;
      });
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 5 : 2;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applySplit(split - step, true);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      applySplit(split + step, true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      applySplit(DEFAULT_LIBRARY_SPLIT, true);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div aria-label={tLibrary(locale, "library.toolbar.label")} role="search" data-testid="library-toolbar-slot">
        {toolbar ?? <LibraryToolbar total={games.total} />}
      </div>
      <LibrarySourceBar sourceErrors={games.sourceErrors} />
      <LibraryOverviewBar />
      <div ref={containerRef} className="flex min-h-0 flex-1">
        <Panel
          as="section"
          aria-label={tLibrary(locale, "library.table.label")}
          className="flex min-w-0 flex-col overflow-hidden"
          style={{ width: `${split}%` }}
          data-testid="library-table-slot"
        >
          <IndexingNotice state={indexing} />
          {table ? table(games) : <LibraryTable games={games} />}
        </Panel>
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-valuenow={Math.round(split)}
          aria-valuemin={30}
          aria-valuemax={85}
          aria-label={tLibrary(locale, "library.resize")}
          className="group flex w-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center outline-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => applySplit(DEFAULT_LIBRARY_SPLIT, true)}
          onKeyDown={onKeyDown}
        >
          <div className="h-full w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-studio-border group-focus-visible:bg-studio-accent" />
        </div>
        <Panel
          as="section"
          aria-label={tLibrary(locale, "library.preview.label")}
          className="min-w-0 flex-1 overflow-hidden"
          data-testid="library-preview-slot"
        >
          {preview ? preview(selected) : <LibraryPreview item={selected} />}
        </Panel>
      </div>
    </div>
  );
}

/** SIG-1275: My Games position backfill progress, shown above the list. */
function IndexingNotice({ state }: { state: MyGamesIndexingState }) {
  const locale = useStudioStore((s) => s.settings.locale);
  if (state.phase === "idle") {
    return null;
  }
  const text =
    state.phase === "running"
      ? state.remaining === null
        ? tLibrary(locale, "library.indexing.running")
        : tLibrary(locale, "library.indexing.remaining", { count: String(state.remaining) })
      : tLibrary(locale, "library.indexing.incomplete");
  return (
    <p role="status" aria-live="polite" className="px-3 py-1 text-xs text-studio-muted" data-testid="library-indexing">
      {text}
    </p>
  );
}

/** Loading / empty / error / partial states plus a one-line-per-game list (until 4/10). */
export function LibraryPlaceholderList({ games }: { games: LibraryGamesState }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const filters = useLibraryStore((s) => s.filters);
  const resetFilters = useLibraryStore((s) => s.resetFilters);
  const selectedKey = useLibraryStore((s) => s.selectedKey);
  const selectGame = useLibraryStore((s) => s.selectGame);
  const { items, loading, error, sourceErrors } = games;
  const failed = Object.keys(sourceErrors);

  if (error && items.length === 0) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm text-studio-fg">
        <p>{tLibrary(locale, "library.error.title", { message: error })}</p>
        <button type="button" className="rounded-md bg-studio-accent px-3 py-1 text-studio-bg" onClick={games.retry}>
          {tLibrary(locale, "library.error.retry")}
        </button>
      </div>
    );
  }
  if (loading && items.length === 0) {
    return (
      <ul aria-busy="true" aria-label={tLibrary(locale, "library.loading")} className="flex flex-col gap-1 p-2">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <li key={index} data-testid="library-skeleton-row" className="h-6 animate-pulse rounded bg-studio-border/40" />
        ))}
      </ul>
    );
  }
  if (!loading && items.length === 0) {
    const noSources = filters.sources.length === 0 || (failed.length > 0 && failed.length >= filters.sources.length);
    return (
      <div className="flex flex-col items-start gap-2 p-4 text-sm text-studio-muted">
        {failed.length > 0 && <PartialNotice failed={failed} />}
        <p>{tLibrary(locale, noSources ? "library.empty.noSources" : "library.empty.noMatch")}</p>
        {!noSources && hasActiveFilters(filters) && (
          <button type="button" className="rounded-md px-2 py-1 text-studio-accent" onClick={resetFilters}>
            {tLibrary(locale, "library.empty.clearFilters")}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {failed.length > 0 && <PartialNotice failed={failed} />}
      {error && (
        <div role="alert" className="flex items-center gap-2 px-3 py-1 text-xs text-studio-fg">
          <span>{tLibrary(locale, "library.error.title", { message: error })}</span>
          <button type="button" className="text-studio-accent" onClick={games.retry}>
            {tLibrary(locale, "library.error.retry")}
          </button>
        </div>
      )}
      <ul className={`min-h-0 flex-1 overflow-auto text-sm ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              aria-pressed={item.key === selectedKey}
              className={`flex w-full gap-2 px-3 py-1 text-left hover:bg-studio-border/30 ${
                item.key === selectedKey ? "bg-studio-border/50" : ""
              }`}
              onClick={() => selectGame(item.key)}
            >
              <span className="truncate">
                {item.white} – {item.black}
              </span>
              <span className="ml-auto shrink-0 text-studio-muted">
                {item.result} {item.date ?? ""}
              </span>
            </button>
          </li>
        ))}
        {games.hasMore && (
          <li className="p-2">
            <button type="button" className="text-studio-accent" onClick={games.loadMore} disabled={games.loadingMore}>
              {tLibrary(locale, games.loadingMore ? "library.loadingMore" : "library.loadMore")}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function PartialNotice({ failed }: { failed: string[] }) {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <div role="status" className="bg-studio-border/30 px-3 py-1 text-xs text-studio-muted">
      {tLibrary(locale, "library.partial", { sources: failed.join(", ") })}
    </div>
  );
}
