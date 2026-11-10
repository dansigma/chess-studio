"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent, type RefObject } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { parsePgnCollection } from "@/src/chess/pgn-games";
import type { SiteLocale } from "@/src/i18n/locale";
import { tLibrary } from "@/src/i18n/library-strings";
import { getLibrarySource } from "@/src/lib/library/sources";
import type { LibraryGameItem } from "@/src/lib/library/types";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "../dock-api";
import { pgnResultToWinner, ResultMark } from "../ResultMark";
import { outcomeFor, PlayerCell } from "../ui/PlayerCell";
import { usePanelSize } from "../use-panel-size";
import { moveSelection, nextSort, visibleColumns, type LibraryColumn } from "./library-columns";
import { hasActiveFilters, useLibraryStore } from "./library-store";
import type { LibraryGamesState } from "./use-library-games";
import { nearEnd, useVirtualRows } from "./use-virtual-rows";

export const LIBRARY_ROW_HEIGHT = 28;
const SKELETON_ROWS = 8;

/** Loads the game's PGN through its source adapter and opens it in a new Studio board. */
export async function openLibraryGame(item: LibraryGameItem, locale: SiteLocale): Promise<void> {
  const store = useStudioStore;
  try {
    const adapter = getLibrarySource(item.sourceId);
    if (!adapter) {
      throw new Error(item.sourceId);
    }
    const pgn = await adapter.loadPgn(item.gameId, new AbortController().signal);
    const game = parsePgnCollection(pgn, 1).games[0];
    if (!game) {
      throw new Error("PGN");
    }
    store.getState().openFileGame(game, { openInNewBoard: true });
    const active = selectActiveBoard(store.getState());
    openBoardPanel(active.id, active.title);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    store.setState({ statusMessage: tLibrary(locale, "library.table.openFailed", { message }) });
  }
}

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
    case "eco":
      return item.eco ?? "—";
    default:
      return "";
  }
}

function Cell({ item, column }: { item: LibraryGameItem; column: LibraryColumn }) {
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
        <div role="gridcell" className={`${base} text-studio-muted`} title={item.opening ?? undefined}>
          {cellText(item, column)}
        </div>
      );
    default:
      return (
        <div
          role="gridcell"
          className={`${base} tabular-nums text-studio-faint ${column.align === "right" ? "text-right" : ""}`}
          title={column.key === "event" ? (item.event ?? undefined) : undefined}
        >
          {cellText(item, column)}
        </div>
      );
  }
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
  const locale = useStudioStore((state) => state.settings.locale);
  const filters = useLibraryStore((s) => s.filters);
  const selectedKey = useLibraryStore((s) => s.selectedKey);
  const selectGame = useLibraryStore((s) => s.selectGame);
  const setSort = useLibraryStore((s) => s.setSort);
  const resetFilters = useLibraryStore((s) => s.resetFilters);
  const { width } = usePanelSize(rootRef);
  const columns = visibleColumns(width);
  const template = columns.map((c) => c.width).join(" ");
  const { items, loading, loadingMore, error, sourceErrors, hasMore, loadMore } = games;
  const failed = Object.keys(sourceErrors);

  const { attachScroll, ...rows } = useVirtualRows({ count: items.length, rowHeight: LIBRARY_ROW_HEIGHT });
  const selectedIndex = useMemo(() => items.findIndex((item) => item.key === selectedKey), [items, selectedKey]);

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

  const visible = items.slice(rows.start, rows.end);
  return (
    <div className="flex min-h-0 flex-1 flex-col text-dense text-studio-fg" data-testid="library-table">
      {failed.length > 0 && <PartialNotice failed={failed} />}
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
            const active = filters.sort.key === column.key;
            const ascending = filters.sort.direction === "asc";
            return (
              <div
                key={column.key}
                role="columnheader"
                aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
                className={column.align === "right" ? "text-right" : undefined}
              >
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
              </div>
            );
          })}
        </div>
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
                    className={`grid cursor-default items-center px-3 hover:bg-studio-hover-subtle ${
                      selected ? "bg-studio-selected" : ""
                    }`}
                    style={{ gridTemplateColumns: template, columnGap: 8, height: LIBRARY_ROW_HEIGHT }}
                    onClick={() => selectGame(item.key)}
                    onDoubleClick={() => void openLibraryGame(item, locale)}
                  >
                    {columns.map((column) => (
                      <Cell key={column.key} item={item} column={column} />
                    ))}
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

function PartialNotice({ failed }: { failed: string[] }) {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <div role="status" className="bg-studio-border/30 px-3 py-1 text-caption text-studio-muted">
      {tLibrary(locale, "library.partial", { sources: failed.join(", ") })}
    </div>
  );
}
