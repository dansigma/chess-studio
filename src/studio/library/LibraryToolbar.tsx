"use client";

import { Chessboard } from "react-chessboard";
import { useEffect, useRef, useState } from "react";
import { Info, SlidersHorizontal, X } from "lucide-react";
import { tLibrary } from "@/src/i18n/library-strings";
import { listLibrarySources } from "@/src/lib/library/sources";
import { useStudioStore } from "@/src/store/studio-store";
import { Badge, SearchInput, Tooltip } from "../ui/Controls";
import {
  buildFilterChips,
  chipRemovalPatch,
  countAdvancedFilters,
  formatGameCount,
  type ChipSource,
  type FilterChip,
} from "./filter-chips";
import { LibraryFiltersPopover } from "./LibraryFiltersPopover";
import { useLibraryStore } from "./library-store";

export const LIBRARY_SEARCH_DEBOUNCE_MS = 300;

export type LibraryToolbarProps = {
  total: number | null;
};

function useAvailableSources(): ChipSource[] {
  const locale = useStudioStore((state) => state.settings.locale);
  // Re-render when personal databases change; the registry itself is not reactive.
  useStudioStore((state) => state.files.databases);
  return listLibrarySources().map((adapter) => ({
    id: adapter.id,
    label: adapter.label(locale),
    capabilities: adapter.capabilities(),
  }));
}

/**
 * SIG-1278 / SIG-1331: the header-row controls (quick search, Filtros button, counter).
 * Rendered next to the Partidas/Jogadores tabs on a single non-wrapping row; the search
 * field is the only part that shrinks.
 */
export function LibraryToolbar({ total }: LibraryToolbarProps) {
  const locale = useStudioStore((state) => state.settings.locale);
  const filters = useLibraryStore((s) => s.filters);
  const filtersOpen = useLibraryStore((s) => s.filtersOpen);
  const setFiltersOpen = useLibraryStore((s) => s.setFiltersOpen);

  const available = useAvailableSources();
  const selectedCount = available.filter((source) => filters.sources.includes(source.id)).length;
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const selectedSources = available.filter((source) => filters.sources.includes(source.id));
  const advancedCount = countAdvancedFilters(filters);

  return (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 px-0.5">
      <DebouncedSearch />
      <div className="relative shrink-0">
        <button
          ref={filtersButtonRef}
          type="button"
          aria-pressed={filtersOpen}
          aria-haspopup="dialog"
          aria-expanded={filtersOpen}
          aria-label={
            advancedCount > 0
              ? tLibrary(
                  locale,
                  advancedCount === 1 ? "library.filters.buttonActive.one" : "library.filters.buttonActive.other",
                  { count: advancedCount },
                )
              : tLibrary(locale, "library.filters.button")
          }
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-dense ${
            filtersOpen || advancedCount > 0
              ? "bg-studio-accent-soft text-studio-accent-text"
              : "text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
          }`}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          {tLibrary(locale, "library.filters.button")}
          {advancedCount > 0 ? <Badge tone="accent">{advancedCount}</Badge> : null}
        </button>
        {filtersOpen ? (
          <LibraryFiltersPopover selectedSources={selectedSources} triggerRef={filtersButtonRef} />
        ) : null}
      </div>
      <span className="shrink-0 whitespace-nowrap text-caption tabular-nums text-studio-muted" data-testid="library-counter">
        {tLibrary(locale, "library.sources.selected", { x: selectedCount, y: available.length })}
        {total !== null
          ? ` · ${tLibrary(
              locale,
              total === 1 ? "library.total.one" : "library.total.other",
              { count: formatGameCount(total, locale) },
            )}`
          : ""}
      </span>
    </div>
  );
}

/** SIG-1331: active filter chips on their own row below the header; absent with no active filter. */
export function LibraryFilterChips() {
  const locale = useStudioStore((state) => state.settings.locale);
  const filters = useLibraryStore((s) => s.filters);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const setSources = useLibraryStore((s) => s.setSources);
  const resetFilters = useLibraryStore((s) => s.resetFilters);

  const available = useAvailableSources();
  const chips = buildFilterChips(filters, available, locale);
  if (chips.length === 0) {
    return null;
  }

  const removeChip = (chip: FilterChip) => {
    const patch = chipRemovalPatch(filters, chip);
    for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
      setFilter(key, patch[key] as never);
    }
  };
  const clearAll = () => {
    resetFilters();
    setSources(available.map((source) => source.id));
  };

  return (
    <ul
      className="flex w-full min-w-0 shrink-0 flex-wrap items-center gap-1 px-0.5"
      aria-label={tLibrary(locale, "library.filters.button")}
      data-testid="library-chips-row"
    >
      {chips.map((chip) => (
        <li key={chip.id} className="max-w-full">
          <ToolbarChip chip={chip} onRemove={() => removeChip(chip)} />
        </li>
      ))}
      {chips.length >= 2 ? (
        <li>
          <button
            type="button"
            onClick={clearAll}
            className="h-[22px] rounded-full px-2 text-caption text-studio-accent-text hover:bg-studio-hover-strong"
          >
            {tLibrary(locale, "library.chip.clearAll")}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/** Chip text whose hover tooltip shows a small board thumbnail of the searched position. */
function PositionChipLabel({ label, fen, alt }: { label: string; fen: string; alt: string }) {
  return (
    <span className="group/tip relative inline-flex min-w-0">
      <span className="truncate">{label}</span>
      <span
        role="tooltip"
        data-testid="library-chip-position-thumbnail"
        className="pointer-events-none absolute left-0 top-full z-[1100] mt-1 hidden rounded-md border border-studio-border-strong bg-studio-elevated p-1 shadow-lg group-hover/tip:block"
      >
        <span role="img" aria-label={alt} className="block aspect-square w-32">
          <Chessboard
            options={{
              id: "library-chip-position",
              position: fen,
              allowDragging: false,
              allowDrawingArrows: false,
              showAnimations: false,
              showNotation: false,
              boardStyle: { width: "100%", height: "100%", borderRadius: 4, overflow: "hidden" },
            }}
          />
        </span>
      </span>
    </span>
  );
}

function ToolbarChip({ chip, onRemove }: { chip: FilterChip; onRemove: () => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const positionFen = useLibraryStore((s) => s.filters.position?.fen ?? null);
  const limitedText =
    chip.limitedBy.length > 0
      ? tLibrary(locale, "library.chip.limited", { sources: chip.limitedBy.join(", ") })
      : null;
  return (
    <span
      data-testid="library-chip"
      className="inline-flex h-[22px] max-w-full items-center gap-1 rounded-full border border-transparent bg-studio-accent-soft pl-2 pr-1 text-caption text-studio-accent-text"
    >
      {chip.field === "position" && positionFen ? (
        <PositionChipLabel label={chip.label} fen={positionFen} alt={tLibrary(locale, "library.position.thumbnailAlt")} />
      ) : (
        <span className="truncate">{chip.label}</span>
      )}
      {limitedText ? (
        <Tooltip label={limitedText} side="bottom">
          <span role="img" aria-label={limitedText} className="inline-flex">
            <Info size={12} />
          </span>
        </Tooltip>
      ) : null}
      {chip.removable ? (
        <button
          type="button"
          aria-label={tLibrary(locale, "library.chip.remove", { label: chip.label })}
          onClick={onRemove}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-studio-hover-strong"
        >
          <X size={10} />
        </button>
      ) : null}
    </span>
  );
}

/** Local text state; writes `filters.query` after a 300 ms pause, Escape clears at once. */
function DebouncedSearch() {
  const locale = useStudioStore((state) => state.settings.locale);
  const query = useLibraryStore((s) => s.filters.query);
  const setQuery = useLibraryStore((s) => s.setQuery);
  const [text, setText] = useState(query);
  const [seenQuery, setSeenQuery] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The store changed from elsewhere (chip removal, clear all): follow it.
  if (query !== seenQuery) {
    setSeenQuery(query);
    setText(query);
  }

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
  }, []);

  const change = (value: string) => {
    setText(value);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      setQuery(value);
    }, LIBRARY_SEARCH_DEBOUNCE_MS);
  };

  return (
    <div
      className="min-w-[5rem] flex-1 basis-48"
      onKeyDown={(event) => {
        if (event.key === "Escape" && (text !== "" || query !== "")) {
          event.stopPropagation();
          if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
          }
          setText("");
          setQuery("");
        }
      }}
    >
      <SearchInput
        value={text}
        onChange={change}
        placeholder={tLibrary(locale, "library.search.placeholder")}
        clearLabel={tLibrary(locale, "library.search.clear")}
      />
    </div>
  );
}
