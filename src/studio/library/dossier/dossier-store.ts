// SIG-1338: Library player dossier state. Deliberately separate from
// `library-store` (and not persisted): the dossier survives switching Library
// modes, and the open player is mirrored in the URL by `use-workspace-view-url`
// (SIG-1346). The other filters stay out of the address bar and localStorage.
import { create } from "zustand";
import { DEFAULT_OVERVIEW_FILTERS, type OverviewFilters } from "@/src/lib/my-games/overview-filters";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";

export type DossierState = {
  /** The player whose dossier is open; null shows the empty hint. */
  player: PlayerHit | null;
  filters: OverviewFilters;
  /** SAN line of the selected opening (filled by the openings issue). */
  selectedLine: string[] | null;
  /** `openingGroupKey` of the selected opening (filled by the openings issue). */
  selectedOpening: string | null;
  openPlayer: (player: PlayerHit, color?: PlayerColorFilter) => void;
  closePlayer: () => void;
  setFilters: (filters: OverviewFilters) => void;
  selectOpening: (key: string, line: string[]) => void;
  clearOpening: () => void;
};

export const useDossierStore = create<DossierState>((set) => ({
  player: null,
  filters: DEFAULT_OVERVIEW_FILTERS,
  selectedLine: null,
  selectedOpening: null,
  // A W/B chip on a search result opens the dossier already filtered by side.
  openPlayer: (player, color = "all") =>
    set({
      player,
      filters: { ...DEFAULT_OVERVIEW_FILTERS, color },
      selectedLine: null,
      selectedOpening: null,
    }),
  closePlayer: () =>
    set({
      player: null,
      filters: DEFAULT_OVERVIEW_FILTERS,
      selectedLine: null,
      selectedOpening: null,
    }),
  setFilters: (filters) => set({ filters }),
  selectOpening: (key, line) => set({ selectedOpening: key, selectedLine: line }),
  clearOpening: () => set({ selectedOpening: null, selectedLine: null }),
}));
