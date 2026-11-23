"use client";

import { LibraryLoadingStatus } from "./LibraryLoadingStatus";
import { useEffect, useMemo, useRef, type KeyboardEvent, type RefObject } from "react";
import { ArrowDown, ArrowUp, ExternalLink, GraduationCap } from "lucide-react";
import type { SiteLocale } from "@/src/i18n/locale";
import { tLibrary } from "@/src/i18n/library-strings";
import { itemYear } from "@/src/lib/library/filters";
import { MASTERS_SOURCE_ID } from "@/src/lib/library/masters-source";
import { getLibrarySource } from "@/src/lib/library/sources";
import type { LibraryGameItem } from "@/src/lib/library/types";
import { useStudioStore } from "@/src/store/studio-store";
import { pgnResultToWinner, ResultMark } from "../ResultMark";
import { EcoBadge } from "../ui/EcoBadge";
import { outcomeFor, PlayerCell } from "../ui/PlayerCell";
import { usePanelSize } from "../use-panel-size";
import { moveSelection, nextSort, visibleColumns, type LibraryColumn } from "./library-columns";
import { hasActiveFilters, useLibraryStore } from "./library-store";
import { LibraryPartialNotice } from "./LibraryPartialNotice";
import { openLibraryGame, trainLibraryGame } from "./open-library-game";
import type { LibraryGamesState } from "./use-library-games";
import { nearEnd, useVirtualRows } from "./use-virtual-rows";
import { localizeOpeningName } from "@/src/lib/opening-names";

export { openLibraryGame, trainLibraryGame } from "./open-library-game";

export const LIBRARY_ROW_HEIGHT = 28;
const SKELETON_ROWS = 8;

function cellText(item: LibraryGameItem, column: LibraryColumn): string {
  switch (column.key) {
    case "whiteElo":
      return item.whiteElo != null ? String(item.whiteElo) : "—";
    case "blackElo":
      return item.blackElo != null ? String(item.blackElo) : "—";
    case "plyCount":
      return item.plyCount != null ? String(Math.ceil(item.plyCount / 2)) : "—";
    case "event":
      return item.event ?? "—";
    case "date": {
      const year = itemYear(item.date);
      return year !== null ? String(year) : "—";
    }
    case "opening":
      return item.opening ?? "—";
    default:
      return "";
  }
}

/** Display name of the source a row came from (database name, "My games", "Masters"). */
function sourceLabel(item: LibraryGameItem, locale: SiteLocale): string {
  return getLibrarySource(item.sourceId)?.label(locale) ?? item.sourceId;
}

function Cell({ item, column, locale }: { item: LibraryGameItem; column: LibraryColumn; locale: SiteLocale }) {
  const winner = pgnResultToWinner(item.result);
  const base = "min-w-0 truncate";
  switch (column.key) {
    case "white":
      return (
        <div role="gridcell" className={base}>
          <PlayerCell name={item.white} rating={null} outcome={outcomeFor(winner, "white")} />
        </div>
      );
    case "black":
      return (
        <div role="gridcell" className={base}>
          <PlayerCell name={item.black} rating={null} outcome={outcomeFor(winner, "black")} />
        </div>
      );
    case "result":
      return (
        <div role="gridcell" className="flex min-w-0 items-center">
          <ResultMark winner={winner} />
        </div>
      );
    case "eco":
      return (
        <div role="gridcell" className={base}>
          <EcoBadge code={item.eco} opening={item.opening} />
        </div>
      );
    case "date":
      return (
        <div
          role="gridcell"
          className={`${base} text-right tabular-nums text-studio-muted`}
          title={item.date ?? undefined}
        >
          {cellText(item, column)}
        </div>
      );
    case "opening": {
      const opening = item.opening ? localizeOpeningName(item.opening, locale, item.eco) : null;
      return (
        <div role="gridcell" className={`${base} text-studio-muted`} title={opening ?? undefined}>
          {opening ?? "—"}
        </div>
      );
    }
    case "source": {
      const label = sourceLabel(item, locale);
      return (
        <div role="gridcell" className="flex min-w-0 items-center" data-testid="library-row-source">
          <span
            className="min-w-0 truncate rounded border border-studio-border px-1 text-caption leading-4 text-studio-faint"
            title={label}
          >
            {label}
          </span>
        </div>
      );
    }
    default:
      return (
        <div
          role="gridcell"
          className={`${base} tabular-nums ${
            column.key === "whiteElo" || column.key === "blackElo" ? "text-studio-muted" : "text-studio-faint"
          } ${column.align === "right" ? "text-right" : ""}`}
          title={column.key === "event" ? (item.event ?? undefined) : undefined}
        >
          {cellText(item, column)}
        </div>
      );
  }
}

/** SIG-1336: per-row quick actions; they never change the selection. */
function RowActions({ item, locale, selected }: { item: LibraryGameItem; locale: SiteLocale; selected: boolean }) {
  const visibility = selected
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100";
  const action =
    "flex h-5 w-5 items-center justify-center rounded text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg focus-visible:outline-2 focus-visible:outline-studio-accent";
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <div
      className={`absolute inset-y-0 right-0 z-10 flex items-center gap-0.5 bg-gradient-to-l to-transparent pl-6 pr-1 ${
        selected ? "from-studio-selected via-studio-selected/95" : "from-studio-panel via-studio-panel/95"
      } ${visibility}`}
    >
      <button
        type="button"
        className={action}
        aria-label={tLibrary(locale, "library.row.open")}
        title={tLibrary(locale, "library.row.open")}
        onClick={(event) => {
          event.stopPropagation();
          void openLibraryGame(item, locale);
        }}
        onDoubleClick={stop}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.stopPropagation();
          }
        }}
      >
        <ExternalLink size={12} aria-hidden />
      </button>
      <button
        type="button"
        className={action}
        aria-label={tLibrary(locale, "library.row.train")}
        title={tLibrary(locale, "library.row.train")}
        onClick={(event) => {
          event.stopPropagation();
          void trainLibraryGame(item, locale);
        }}
        onDoubleClick={stop}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.stopPropagation();
          }
        }}
      >
        <GraduationCap size={12} aria-hidden />
      </button>
    </div>
  );
}

export function LibraryTable({ games }: { games: LibraryGamesState }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <LibraryTableBody games={games} rootRef={rootRef} />
    </div>
  );
}

function LibraryTableBody({ games, rootRef }: { games: LibraryGamesState; rootRef: RefObject<HTMLDivElement | null> }) {
  const filesHydrated = useStudioStore((state) => state.filesHydrated);
  const locale = useStudioStore((state) => state.settings.locale);
  const filters = useLibraryStore((s) => s.filters);
  const selectedKey = useLibraryStore((s) => s.selectedKey);
  const selectGame = useLibraryStore((s) => s.selectGame);
  const setSort = useLibraryStore((s) => s.setSort);
  const resetFilters = useLibraryStore((s) => s.resetFilters);
  const folderId = useLibraryStore((s) => s.folderId);
  const { width } = usePanelSize(rootRef);
  const columns = visibleColumns(width, filters.sources.length > 1);
  const template = columns.map((c) => c.width).join(" ");
  const { items, loading, loadingMore, error, sourceErrors, hasMore, loadMore } = games;
  const failed = Object.keys(sourceErrors);

  const { attachScroll, ...rows } = useVirtualRows({ count: items.length, rowHeight: LIBRARY_ROW_HEIGHT });
  const selectedIndex = useMemo(() => items.findIndex((item) => item.key === selectedKey), [items, selectedKey]);

  // Masters only searches by board position: with other sources and a text
  // search but no position, its rows are not what the text matched.
  const mastersTextNote =
    filters.sources.length > 1 &&
    filters.sources.includes(MASTERS_SOURCE_ID) &&
    filters.position === null &&
    filters.query.trim() !== "";
  const partialSources = filters.sources.filter(
    (id) => getLibrarySource(id)?.capabilities().sort === "partial",
  );

  // Infinite load: the rendered window reached the end of the loaded rows.
  const wantsMore = hasMore && !loading && !loadingMore && nearEnd(rows.end, items.length);
  useEffect(() => {
    if (wantsMore) {
      loadMore();
    }
  }, [wantsMore, loadMore]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      // SIG-1339: Escape clears the selection, bringing the database summary back.
      if (selectedKey !== null) {
        event.preventDefault();
        selectGame(null);
      }
      return;
    }
    if (event.key === "Enter") {
      const item = items[selectedIndex];
      if (item) {
        event.preventDefault();
        void openLibraryGame(item, locale);
      }
      return;
    }
    const next = moveSelection(event.key, selectedIndex, items.length);
    if (next === null) {
      return;
    }
    event.preventDefault();
    const item = items[next];
    if (item) {
      selectGame(item.key);
      rows.scrollToIndex(next);
    }
  }

  if (!filesHydrated && items.length === 0) {
    return <LibraryLoadingStatus />;
  }

  if (error && items.length === 0) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-dense text-studio-fg">
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
      <div className="flex flex-col items-start gap-2 p-4 text-dense text-studio-muted">
        {failed.length > 0 && <LibraryPartialNotice failed={failed} onRetry={games.retry} />}
        <p>
          {tLibrary(
            locale,
            filters.sources.length === 0 && folderId !== null
              ? "library.empty.folder"
              : noSources
                ? "library.empty.noSources"
                : "library.empty.noMatch",
          )}
        </p>
        {!noSources && hasActiveFilters(filters) && (
          <button type="button" className="rounded-md px-2 py-1 text-studio-accent" onClick={resetFilters}>
            {tLibrary(locale, "library.empty.clearFilters")}
          </button>
        )}
      </div>
    );
  }

  const visible = items.slice(rows.start, rows.end);
  return (
    <div className="flex min-h-0 flex-1 flex-col text-dense text-studio-fg" data-testid="library-table">
      {failed.length > 0 && <LibraryPartialNotice failed={failed} onRetry={games.retry} />}
      {error && (
        <div role="alert" className="flex items-center gap-2 px-3 py-1 text-caption text-studio-fg">
          <span>{tLibrary(locale, "library.error.title", { message: error })}</span>
          <button type="button" className="text-studio-accent" onClick={games.retry}>
            {tLibrary(locale, "library.error.retry")}
          </button>
        </div>
      )}
      <div
        role="grid"
        aria-label={tLibrary(locale, "library.table.label")}
        aria-rowcount={items.length + 1}
        aria-busy={loading}
        tabIndex={0}
        aria-activedescendant={selectedKey && selectedIndex >= 0 ? rowDomId(selectedKey) : undefined}
        className="flex min-h-0 flex-1 flex-col outline-none focus-visible:ring-1 focus-visible:ring-studio-accent"
        onKeyDown={onKeyDown}
      >
        <div role="row" className="grid shrink-0 border-b border-studio-border-subtle px-3" style={{ gridTemplateColumns: template, columnGap: 8 }}>
          {columns.map((column) => {
            const active = column.sortable && filters.sort.key === column.key;
            const ascending = filters.sort.direction === "asc";
            return (
              <div
                key={column.key}
                role="columnheader"
                aria-sort={column.sortable ? (active ? (ascending ? "ascending" : "descending") : "none") : undefined}
                className={column.align === "right" ? "text-right" : undefined}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    className={`inline-flex max-w-full items-center gap-0.5 py-1.5 text-caption hover:text-studio-fg ${
                      active ? "text-studio-fg" : "text-studio-faint"
                    }`}
                    onClick={() => setSort(nextSort(filters.sort, column))}
                  >
                    <span className="truncate">{tLibrary(locale, column.label)}</span>
                    {active ? ascending ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden /> : null}
                  </button>
                ) : (
                  <span className="inline-block max-w-full truncate py-1.5 text-caption text-studio-faint">
                    {tLibrary(locale, column.label)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {mastersTextNote && (
          <div role="note" data-testid="library-masters-text-note" className="shrink-0 px-3 py-1 text-caption text-studio-faint">
            {tLibrary(locale, "library.masters.textSearchNote", {
              name: getLibrarySource(MASTERS_SOURCE_ID)?.label(locale) ?? "Masters",
            })}
          </div>
        )}
        {partialSources.length > 0 && (
          <div role="note" className="shrink-0 px-3 py-1 text-caption text-studio-faint">
            {tLibrary(locale, "library.sort.partial", {
              sources: partialSources.map((id) => getLibrarySource(id)?.label(locale) ?? id).join(", "),
            })}
          </div>
        )}
        <div
          ref={attachScroll}
          onScroll={rows.onScroll}
          className={`min-h-0 flex-1 overflow-auto ${loading ? "opacity-60" : ""}`}
          data-testid="library-scroll"
        >
          <div style={{ height: rows.totalHeight + (loadingMore ? LIBRARY_ROW_HEIGHT : 0), position: "relative" }}>
            <div style={{ transform: `translateY(${rows.offsetTop}px)` }}>
              {visible.map((item, offset) => {
                const index = rows.start + offset;
                const selected = item.key === selectedKey;
                return (
                  <div
                    key={item.key}
                    id={rowDomId(item.key)}
                    role="row"
                    aria-rowindex={index + 2}
                    aria-selected={selected}
                    data-testid="library-row"
                    className={`group relative grid cursor-default items-center px-3 ${
                      selected ? "bg-studio-selected" : "hover:bg-studio-hover-subtle"
                    }`}
                    style={{ gridTemplateColumns: template, columnGap: 8, height: LIBRARY_ROW_HEIGHT }}
                    onClick={(event) => {
                      // SIG-1339: clicking the selected row again clears it; a
                      // double-click's second click must keep the selection
                      // before opening the game.
                      if (event.detail > 1) {
                        return;
                      }
                      selectGame(item.key === selectedKey ? null : item.key);
                    }}
                    onDoubleClick={() => void openLibraryGame(item, locale)}
                  >
                    {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-studio-accent" />}
                    {columns.map((column) => (
                      <Cell key={column.key} item={item} column={column} locale={locale} />
                    ))}
                    <RowActions item={item} locale={locale} selected={selected} />
                  </div>
                );
              })}
            </div>
            {loadingMore && (
              <div
                role="status"
                data-testid="library-loading-row"
                className="absolute inset-x-0 flex items-center px-3 text-caption text-studio-faint"
                style={{ top: rows.totalHeight, height: LIBRARY_ROW_HEIGHT }}
              >
                {tLibrary(locale, "library.loadingMore")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function rowDomId(key: string): string {
  return `library-row-${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}
