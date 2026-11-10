// SIG-1272: Library data contract. Shared by every Library issue (SIG-1271);
// keep it exactly in sync with the Linear spec.
export type LibrarySourceId = "my-games" | "masters" | `file:${string}`;

export type LibraryResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export type LibraryGameItem = {
  key: string; // `${sourceId}:${gameId}`, unique across sources
  sourceId: LibrarySourceId;
  gameId: string;
  white: string;
  whiteElo: number | null;
  black: string;
  blackElo: number | null;
  result: LibraryResult;
  eco: string | null;
  opening: string | null;
  plyCount: number | null; // null when the source does not know it (Masters)
  event: string | null;
  date: string | null; // "yyyy", "yyyy-mm" or "yyyy-mm-dd"
};

export type LibraryColor = "both" | "white" | "black";
export type LibraryResultFilter = "all" | "1-0" | "0-1" | "draw";
export type LibraryAnnotationsFilter = "all" | "annotated" | "commented";
export type LibrarySortKey =
  | "white"
  | "whiteElo"
  | "black"
  | "blackElo"
  | "result"
  | "eco"
  | "plyCount"
  | "event"
  | "date";

export type LibraryFilterState = {
  sources: LibrarySourceId[]; // at least one
  query: string; // players, event, opening name, ECO
  opponent: string; // name on the side opposite to `color`; either side when color is "both"
  color: LibraryColor; // side played by the main player (the account owner in My Games)
  result: LibraryResultFilter; // from White's point of view
  annotations: LibraryAnnotationsFilter;
  position: { fen: string } | null;
  sort: { key: LibrarySortKey; direction: "asc" | "desc" };
};

// Sources: every source registered at launch time that is always present
// (My Games). Personal databases are added by the caller with
// `defaultLibraryFilters`, since their ids depend on the store.
export const DEFAULT_LIBRARY_FILTERS: LibraryFilterState = {
  sources: ["my-games"],
  query: "",
  opponent: "",
  color: "both",
  result: "all",
  annotations: "all",
  position: null,
  sort: { key: "date", direction: "desc" },
};

// How completely a source applies a filter:
// "full" = over the whole source, "partial" = only over the games the source returned, "none" = not supported.
export type LibrarySupport = "full" | "partial" | "none";

export type LibrarySourceCapabilities = {
  textSearch: LibrarySupport; // query and opponent
  color: LibrarySupport;
  result: LibrarySupport;
  annotations: LibrarySupport;
  position: LibrarySupport;
  sort: LibrarySupport;
  maxResults: number | null; // e.g. 15 for Masters; null = unbounded
};

export type LibraryPage = {
  items: LibraryGameItem[];
  nextCursor: string | null;
  total: number | null; // null when unknown
};

export interface LibrarySourceAdapter {
  id: LibrarySourceId;
  label(locale: string): string;
  capabilities(): LibrarySourceCapabilities;
  list(
    filters: LibraryFilterState,
    cursor: string | null,
    limit: number,
    signal: AbortSignal,
  ): Promise<LibraryPage>;
  loadPgn(gameId: string, signal: AbortSignal): Promise<string>;
}

export type LibraryQueryResult = {
  items: LibraryGameItem[];
  nextCursor: string | null;
  total: number | null;
  sourceErrors: Partial<Record<LibrarySourceId, string>>;
};

/** Default filters with an explicit source selection. */
export function defaultLibraryFilters(sources: LibrarySourceId[]): LibraryFilterState {
  return {
    ...DEFAULT_LIBRARY_FILTERS,
    sources: sources.length > 0 ? sources : DEFAULT_LIBRARY_FILTERS.sources,
  };
}
