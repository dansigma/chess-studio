// SIG-1278: pure mapping from Library filters to removable chips.
import { tLibrary, type LibraryStringKey } from "@/src/i18n/library-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import {
  DEFAULT_LIBRARY_FILTERS,
  type LibraryFilterState,
  type LibrarySourceCapabilities,
  type LibrarySourceId,
} from "@/src/lib/library/types";
import { limitedSourceLabels } from "./filter-support";

export type ChipField = "sources" | "query" | "opponent" | "color" | "result" | "annotations" | "position" | "player" | "elo" | "eco" | "period";

/** What the chip builder needs to know about one available source. */
export type ChipSource = {
  id: LibrarySourceId;
  label: string;
  capabilities: LibrarySourceCapabilities;
};

export type FilterChip = {
  id: string;
  field: ChipField;
  label: string;
  /** Source chips of the last remaining source cannot be removed. */
  removable: boolean;
  /** Selected sources that apply this filter only partly or not at all. */
  limitedBy: string[];
  /** Source id for source chips. */
  sourceId?: LibrarySourceId;
};

const CAPABILITY_KEY: Partial<Record<ChipField, keyof LibrarySourceCapabilities>> = {
  query: "textSearch",
  opponent: "textSearch",
  color: "color",
  result: "result",
  annotations: "annotations",
  position: "position",
  player: "player",
  elo: "eloRange",
  eco: "eco",
  period: "date",
};

/** Filters counted by the Filters button badge (everything but search and sources). */
export function countAdvancedFilters(filters: LibraryFilterState): number {
  return (
    (filters.opponent.trim() !== "" ? 1 : 0) +
    (filters.color !== "both" ? 1 : 0) +
    (filters.result !== "all" ? 1 : 0) +
    (filters.annotations !== "all" ? 1 : 0) +
    (filters.position !== null ? 1 : 0) +
    (filters.player.trim() !== "" ? 1 : 0) +
    (filters.eloMin !== null || filters.eloMax !== null ? 1 : 0) +
    (filters.eco.trim() !== "" ? 1 : 0) +
    (filters.yearFrom !== null || filters.yearTo !== null ? 1 : 0)
  );
}

function limitedSources(field: ChipField, selected: ChipSource[]): string[] {
  const key = CAPABILITY_KEY[field];
  return key ? limitedSourceLabels(key, selected) : [];
}

/** "2500–2800", "≥ 2500" or "≤ 2800"; the bounds are swapped when typed backwards. */
export function rangeSummary(a: number | null, b: number | null): string {
  const [low, high] = a !== null && b !== null && a > b ? [b, a] : [a, b];
  if (low !== null && high !== null) {
    return low === high ? String(low) : `${low}–${high}`;
  }
  return low !== null ? `≥ ${low}` : `≤ ${high}`;
}

function fenSummary(fen: string): string {
  const placement = fen.split(" ")[0] ?? fen;
  return placement.length > 14 ? `${placement.slice(0, 14)}…` : placement;
}

export function buildFilterChips(
  filters: LibraryFilterState,
  available: ChipSource[],
  locale: SiteLocale,
): FilterChip[] {
  const t = (key: LibraryStringKey, vars?: Record<string, string | number>) => tLibrary(locale, key, vars);
  const selected = available.filter((source) => filters.sources.includes(source.id));
  const chips: FilterChip[] = [];
  const push = (field: ChipField, key: LibraryStringKey, value: string, extra: Partial<FilterChip> = {}) => {
    chips.push({
      id: extra.id ?? field,
      field,
      label: t(key, { value }),
      removable: true,
      limitedBy: limitedSources(field, selected),
      ...extra,
    });
  };

  if (selected.length > 0 && selected.length < available.length) {
    for (const source of selected) {
      push("sources", "library.chip.source", source.label, {
        id: `source:${source.id}`,
        sourceId: source.id,
        removable: selected.length > 1,
        limitedBy: [],
      });
    }
  }
  const query = filters.query.trim();
  if (query) {
    push("query", "library.chip.query", query);
  }
  const opponent = filters.opponent.trim();
  if (opponent) {
    push("opponent", "library.chip.opponent", opponent);
  }
  if (filters.color !== "both") {
    push("color", "library.chip.color", t(filters.color === "white" ? "library.chip.white" : "library.chip.black"));
  }
  if (filters.result !== "all") {
    push("result", "library.chip.result", filters.result === "draw" ? t("library.chip.draw") : filters.result);
  }
  if (filters.annotations !== "all") {
    push(
      "annotations",
      "library.chip.annotations",
      t(filters.annotations === "annotated" ? "library.chip.annotated" : "library.chip.commented"),
    );
  }
  if (filters.position) {
    push("position", "library.chip.position", fenSummary(filters.position.fen));
  }
  const player = filters.player.trim();
  if (player) {
    const side =
      filters.playerColor === "both"
        ? ""
        : ` (${t(filters.playerColor === "white" ? "library.chip.white" : "library.chip.black")})`;
    push("player", "library.chip.player", `${player}${side}`);
  }
  if (filters.eloMin !== null || filters.eloMax !== null) {
    push("elo", "library.chip.elo", rangeSummary(filters.eloMin, filters.eloMax));
  }
  const eco = filters.eco.trim();
  if (eco) {
    push("eco", "library.chip.eco", eco.toUpperCase());
  }
  if (filters.yearFrom !== null || filters.yearTo !== null) {
    push("period", "library.chip.period", rangeSummary(filters.yearFrom, filters.yearTo));
  }
  return chips;
}

/** Store patch that resets only the field of `chip` ("Limpar tudo" resets via the store). */
export function chipRemovalPatch(filters: LibraryFilterState, chip: FilterChip): Partial<LibraryFilterState> {
  switch (chip.field) {
    case "sources":
      return {
        sources: filters.sources.filter((id) => id !== chip.sourceId),
      };
    case "query":
      return { query: DEFAULT_LIBRARY_FILTERS.query };
    case "opponent":
      return { opponent: DEFAULT_LIBRARY_FILTERS.opponent };
    case "color":
      return { color: DEFAULT_LIBRARY_FILTERS.color };
    case "result":
      return { result: DEFAULT_LIBRARY_FILTERS.result };
    case "annotations":
      return { annotations: DEFAULT_LIBRARY_FILTERS.annotations };
    case "position":
      return { position: DEFAULT_LIBRARY_FILTERS.position };
    case "player":
      return { player: DEFAULT_LIBRARY_FILTERS.player, playerColor: DEFAULT_LIBRARY_FILTERS.playerColor };
    case "elo":
      return { eloMin: null, eloMax: null };
    case "eco":
      return { eco: DEFAULT_LIBRARY_FILTERS.eco };
    case "period":
      return { yearFrom: null, yearTo: null };
  }
}

/** Locale-formatted number ("1.234" in pt-BR, "1,234" in en). */
export function formatGameCount(count: number, locale: SiteLocale): string {
  return new Intl.NumberFormat(locale === "pt-br" ? "pt-BR" : "en").format(count);
}
