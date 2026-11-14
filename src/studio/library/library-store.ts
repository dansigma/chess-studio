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
  /** SIG-1325: folder limiting the PGN file cards in the source bar; null = all folders. Not persisted. */
  folderId: string | null;
  setFolderId: (folderId: string | null) => void;
  setMode: (mode: LibraryMode) => void;
  setFilter: <K extends keyof LibraryFilterState>(key: K, value: LibraryFilterState[K]) => void;
  setSources: (sources: LibraryFilterState["sources"]) => void;
  setQuery: (query: string) => void;
  setOpponent: (opponent: string) => void;
  setColor: (color: LibraryFilterState["color"]) => void;
  setResult: (result: LibraryFilterState["result"]) => void;
  setAnnotations: (annotations: LibraryFilterState["annotations"]) => void;
  setPosition: (position: LibraryFilterState["position"]) => void;
  setPlayer: (player: string) => void;
  setPlayerColor: (color: LibraryFilterState["playerColor"]) => void;
  setEloRange: (min: number | null, max: number | null) => void;
  setEco: (eco: string) => void;
  setYearRange: (from: number | null, to: number | null) => void;
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
  folderId: null,
  setFolderId: (folderId) => set({ folderId }),
  setMode: (mode) => set({ mode }),
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  setSources: (sources) => set((s) => ({ filters: { ...s.filters, sources } })),
  setQuery: (query) => set((s) => ({ filters: { ...s.filters, query } })),
  setOpponent: (opponent) => set((s) => ({ filters: { ...s.filters, opponent } })),
  setColor: (color) => set((s) => ({ filters: { ...s.filters, color } })),
  setResult: (result) => set((s) => ({ filters: { ...s.filters, result } })),
  setAnnotations: (annotations) => set((s) => ({ filters: { ...s.filters, annotations } })),
  setPosition: (position) => set((s) => ({ filters: { ...s.filters, position } })),
  setPlayer: (player) => set((s) => ({ filters: { ...s.filters, player } })),
  setPlayerColor: (playerColor) => set((s) => ({ filters: { ...s.filters, playerColor } })),
  setEloRange: (eloMin, eloMax) => set((s) => ({ filters: { ...s.filters, eloMin, eloMax } })),
  setEco: (eco) => set((s) => ({ filters: { ...s.filters, eco } })),
  setYearRange: (yearFrom, yearTo) => set((s) => ({ filters: { ...s.filters, yearFrom, yearTo } })),
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
    filters.position !== null ||
    filters.player.trim() !== "" ||
    filters.eloMin !== null ||
    filters.eloMax !== null ||
    filters.eco.trim() !== "" ||
    filters.yearFrom !== null ||
    filters.yearTo !== null
  );
}

export type { LibraryGameItem };
