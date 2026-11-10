"use client";

import { Chessboard } from "react-chessboard";
import { useEffect, useRef, useState } from "react";
import { Database, Info, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { tLibrary } from "@/src/i18n/library-strings";
import { listLibrarySources } from "@/src/lib/library/sources";
import type { LibrarySourceId } from "@/src/lib/library/types";
import { useStudioStore } from "@/src/store/studio-store";
import { Badge, SearchInput, Tooltip } from "../ui/Controls";
import { MenuDivider, MenuItem, MenuSurface } from "../ui/Menu";
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
  sourceErrors: Partial<Record<LibrarySourceId, string>>;
};

/** SIG-1278: quick search, source picker, counter, filter chips and Filters button. */
export function LibraryToolbar({ total, sourceErrors }: LibraryToolbarProps) {
  const locale = useStudioStore((state) => state.settings.locale);
  // Re-render when personal databases change; the registry itself is not reactive.
  useStudioStore((state) => state.files.databases);
  const filters = useLibraryStore((s) => s.filters);
  const filtersOpen = useLibraryStore((s) => s.filtersOpen);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const setSources = useLibraryStore((s) => s.setSources);
  const resetFilters = useLibraryStore((s) => s.resetFilters);
  const setFiltersOpen = useLibraryStore((s) => s.setFiltersOpen);

  const available: ChipSource[] = listLibrarySources().map((adapter) => ({
    id: adapter.id,
    label: adapter.label(locale),
    capabilities: adapter.capabilities(),
  }));
  const selectedCount = available.filter((source) => filters.sources.includes(source.id)).length;
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const selectedSources = available.filter((source) => filters.sources.includes(source.id));
  const chips = buildFilterChips(filters, available, locale);
  const advancedCount = countAdvancedFilters(filters);

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
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 px-0.5">
      <DebouncedSearch />
      <SourcePicker available={available} sourceErrors={sourceErrors} />
      <span className="text-caption tabular-nums text-studio-muted" data-testid="library-counter">
        {tLibrary(locale, "library.sources.selected", { x: selectedCount, y: available.length })}
        {total !== null ? ` · ${tLibrary(locale, "library.total", { count: formatGameCount(total, locale) })}` : ""}
      </span>
      <div className="relative ml-auto shrink-0">
      <button
        ref={filtersButtonRef}
        type="button"
        aria-pressed={filtersOpen}
        aria-haspopup="dialog"
        aria-expanded={filtersOpen}
        aria-label={
          advancedCount > 0
            ? tLibrary(locale, "library.filters.buttonActive", { count: advancedCount })
            : tLibrary(locale, "library.filters.button")
        }
        onClick={() => setFiltersOpen(!filtersOpen)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-dense ${
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
      {chips.length > 0 ? (
        <ul className="flex w-full min-w-0 flex-wrap items-center gap-1" aria-label={tLibrary(locale, "library.filters.button")}>
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
      ) : null}
    </div>
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
      className="min-w-[10rem] flex-1 basis-48"
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
      />
    </div>
  );
}

function SourcePicker({
  available,
  sourceErrors,
}: {
  available: ChipSource[];
  sourceErrors: Partial<Record<LibrarySourceId, string>>;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const selected = useLibraryStore((s) => s.filters.sources);
  const setSources = useLibraryStore((s) => s.setSources);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const ids = available.map((source) => source.id);
  const selectedAvailable = ids.filter((id) => selected.includes(id));
  const allSelected = selectedAvailable.length === ids.length;
  const anyFailed = selectedAvailable.some((id) => sourceErrors[id] !== undefined);

  const toggle = (id: LibrarySourceId) => {
    if (selected.includes(id)) {
      if (selectedAvailable.length <= 1) {
        return; // last-source guard
      }
      setSources(selected.filter((other) => other !== id));
    } else {
      setSources([...selected, id]);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-dense text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg ${
          open ? "ring-1 ring-studio-border-strong" : ""
        }`}
      >
        <Database size={14} aria-hidden="true" />
        {tLibrary(locale, "library.sources.button")}
        {anyFailed ? <TriangleAlert size={12} className="text-studio-danger" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <>
          <button
            type="button"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            aria-label={tLibrary(locale, "library.sources.button")}
            onClick={() => setOpen(false)}
          />
          <MenuSurface
            label={tLibrary(locale, "library.sources.button")}
            className="absolute left-0 top-8 z-20 min-w-60 max-w-[calc(100vw-1rem)]"
            onClose={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
          >
            <MenuItem
              label={tLibrary(locale, "library.sources.selectAll")}
              checked={allSelected}
              disabled={allSelected}
              onClick={() => setSources(ids)}
            />
            <MenuDivider />
            {available.map((source) => {
              const isSelected = selected.includes(source.id);
              const isLast = isSelected && selectedAvailable.length <= 1;
              const error = sourceErrors[source.id];
              return (
                <MenuItem
                  key={source.id}
                  label={source.label}
                  checked={isSelected}
                  disabled={isLast}
                  disabledReason={isLast ? tLibrary(locale, "library.sources.lastGuard") : undefined}
                  leading={
                    error !== undefined ? (
                      <span
                        role="img"
                        title={tLibrary(locale, "library.sources.failed", { message: error })}
                        aria-label={tLibrary(locale, "library.sources.failed", { message: error })}
                        className="text-studio-danger"
                      >
                        <TriangleAlert size={12} />
                      </span>
                    ) : undefined
                  }
                  onClick={() => toggle(source.id)}
                />
              );
            })}
          </MenuSurface>
        </>
      ) : null}
    </div>
  );
}
