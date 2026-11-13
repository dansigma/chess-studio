import { create } from "zustand";
import type { LibraryMode } from "../workspace-view-url";
import {
  DEFAULT_LIBRARY_FILTERS,
  type LibraryFilterState,
  type LibraryGameItem,
} from "@/src/lib/library/types";

// SIG-1274: Library state, deliberately separate from `useStudioStore` so it
// never touches Studio persistence.
export type LibraryState = {
  filters: LibraryFilterState;
  selectedKey: string | null;
  filtersOpen: boolean;
  /** SIG-1318: Games (default) or Players; mirrored in `?mode=players`. */
  mode: LibraryMode;
  setMode: (mode: LibraryMode) => void;
  setFilter: <K extends keyof LibraryFilterState>(key: K, value: LibraryFilterState[K]) => void;
  setSources: (sources: LibraryFilterState["sources"]) => void;
  setQuery: (query: string) => void;
  setOpponent: (opponent: string) => void;
  setColor: (color: LibraryFilterState["color"]) => void;
  setResult: (result: LibraryFilterState["result"]) => void;
  setAnnotations: (annotations: LibraryFilterState["annotations"]) => void;
  setPosition: (position: LibraryFilterState["position"]) => void;
  setSort: (sort: LibraryFilterState["sort"]) => void;
  resetFilters: () => void;
  selectGame: (key: string | null) => void;
  setFiltersOpen: (open: boolean) => void;
};

export const useLibraryStore = create<LibraryState>((set) => ({
  filters: DEFAULT_LIBRARY_FILTERS,
  selectedKey: null,
  filtersOpen: false,
  mode: "games",
  setMode: (mode) => set({ mode }),
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  setSources: (sources) => set((s) => ({ filters: { ...s.filters, sources } })),
  setQuery: (query) => set((s) => ({ filters: { ...s.filters, query } })),
  setOpponent: (opponent) => set((s) => ({ filters: { ...s.filters, opponent } })),
  setColor: (color) => set((s) => ({ filters: { ...s.filters, color } })),
  setResult: (result) => set((s) => ({ filters: { ...s.filters, result } })),
  setAnnotations: (annotations) => set((s) => ({ filters: { ...s.filters, annotations } })),
  setPosition: (position) => set((s) => ({ filters: { ...s.filters, position } })),
  setSort: (sort) => set((s) => ({ filters: { ...s.filters, sort } })),
  // Keeps the chosen sources and sort: "clear" removes narrowing filters only.
  resetFilters: () =>
    set((s) => ({
      filters: { ...DEFAULT_LIBRARY_FILTERS, sources: s.filters.sources, sort: s.filters.sort },
    })),
  selectGame: (selectedKey) => set({ selectedKey }),
  setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
}));

/** True when any narrowing filter (not sources or sort) is active. */
export function hasActiveFilters(filters: LibraryFilterState): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.opponent.trim() !== "" ||
    filters.color !== "both" ||
    filters.result !== "all" ||
    filters.annotations !== "all" ||
    filters.position !== null
  );
}

export type { LibraryGameItem };
