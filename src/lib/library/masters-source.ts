import type { ExplorerGameRow, ExplorerResponse } from "../explorer-types.ts";
import { isExplorerResponse } from "../explorer-types.ts";
import { isSiteLocale, DEFAULT_SITE_LOCALE } from "../../i18n/locale.ts";
import { tPanels } from "../../i18n/studio-panel-strings.ts";
import { matchesAdvancedFilters } from "./filters.ts";
import type {
  LibraryFilterState,
  LibraryGameItem,
  LibraryResult,
  LibrarySortKey,
  LibrarySourceAdapter,
  LibrarySourceCapabilities,
} from "./types.ts";

export const MASTERS_SOURCE_ID = "masters" as const;
export const MASTERS_MAX_RESULTS = 15;
export const MASTERS_UNAVAILABLE_MESSAGE = "Masters is temporarily unavailable";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const CAPABILITIES: LibrarySourceCapabilities = {
  textSearch: "partial",
  color: "partial",
  result: "partial",
  annotations: "none",
  position: "full",
  player: "partial",
  eloRange: "partial",
  eco: "partial",
  date: "partial",
  sort: "partial",
  maxResults: MASTERS_MAX_RESULTS,
};

export type MastersSourceOptions = {
  /** Injected in tests; defaults to the global fetch (same-origin app routes only). */
  fetchImpl?: typeof fetch;
};

function formatDate(year: number | null, month: number | null): string | null {
  if (year == null) {
    return null;
  }
  const yyyy = String(year).padStart(4, "0");
  if (month == null || month < 1 || month > 12) {
    return yyyy;
  }
  return `${yyyy}-${String(month).padStart(2, "0")}`;
}

function resultOf(winner: ExplorerGameRow["winner"]): LibraryResult {
  if (winner === "white") return "1-0";
  if (winner === "black") return "0-1";
  if (winner === "draw") return "1/2-1/2";
  return "*";
}

/** Maps one explorer game row to the shared Library item. */
export function mapMastersGame(game: ExplorerGameRow, opening: ExplorerResponse["opening"]): LibraryGameItem {
  return {
    key: `${MASTERS_SOURCE_ID}:${game.id}`,
    sourceId: MASTERS_SOURCE_ID,
    gameId: game.id,
    white: game.whiteName,
    whiteElo: game.whiteRating,
    black: game.blackName,
    blackElo: game.blackRating,
    result: resultOf(game.winner),
    // eco / opening describe the searched position, not the game.
    eco: opening?.eco || game.eco || null,
    opening: opening?.name || game.opening || null,
    // Not in the explorer list: the preview fills these after loading the PGN
    // (SIG-1192 keeps event null on purpose).
    plyCount: null,
    event: null,
    date: formatDate(game.year, game.month),
  };
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/** Client-side filters over the (at most 15) games the explorer returned. */
export function filterMastersItems(items: LibraryGameItem[], filters: LibraryFilterState): LibraryGameItem[] {
  const query = norm(filters.query);
  const opponent = norm(filters.opponent);
  return items.filter((item) => {
    if (query) {
      const haystack = [item.white, item.black, item.event, item.opening, item.eco]
        .filter((part): part is string => !!part)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (opponent) {
      // Opponent is the side opposite to `color`; either side when "both".
      const sides =
        filters.color === "white" ? [item.black] : filters.color === "black" ? [item.white] : [item.white, item.black];
      if (!sides.some((name) => norm(name).includes(opponent))) return false;
    }
    if (filters.result === "1-0" && item.result !== "1-0") return false;
    if (filters.result === "0-1" && item.result !== "0-1") return false;
    if (filters.result === "draw" && item.result !== "1/2-1/2") return false;
    return matchesAdvancedFilters(item, filters);
  });
}

function sortValue(item: LibraryGameItem, key: LibrarySortKey): string | number | null {
  switch (key) {
    case "white":
      return item.white;
    case "black":
      return item.black;
    case "whiteElo":
      return item.whiteElo;
    case "blackElo":
      return item.blackElo;
    case "result":
      return item.result;
    case "eco":
      return item.eco;
    case "plyCount":
      return item.plyCount;
    case "event":
      return item.event;
    case "date":
      return item.date;
  }
}

/** Sorts a copy; nulls last in both directions, ties by key. */
export function sortMastersItems(items: LibraryGameItem[], sort: LibraryFilterState["sort"]): LibraryGameItem[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    if (av == null && bv == null) return a.key.localeCompare(b.key);
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
    return cmp === 0 ? a.key.localeCompare(b.key) : cmp * dir;
  });
}

export function createMastersSource(options: MastersSourceOptions = {}): LibrarySourceAdapter {
  const doFetch = (input: string, init: RequestInit) => (options.fetchImpl ?? fetch)(input, init);

  return {
    id: MASTERS_SOURCE_ID,
    label(locale) {
      return tPanels(isSiteLocale(locale) ? locale : DEFAULT_SITE_LOCALE, "explorer.source.masters");
    },
    capabilities: () => ({ ...CAPABILITIES }),
    async list(filters, cursor, limit, signal) {
      // The explorer returns one page of at most 15 games; nothing follows.
      if (cursor) {
        return { items: [], nextCursor: null, total: null };
      }
      const fen = filters.position?.fen ?? START_FEN;
      // Same app route (and explorer cache) as the Explorer panel; never
      // explorer.lichess.ovh directly from the browser.
      const response = await doFetch(`/api/explorer?fen=${encodeURIComponent(fen)}&source=masters`, { signal }).catch(
        (error: unknown) => {
          if (signal.aborted) throw error;
          throw new Error(MASTERS_UNAVAILABLE_MESSAGE);
        },
      );
      if (!response.ok) {
        // 429 (rate limit) and upstream failures alike.
        throw new Error(MASTERS_UNAVAILABLE_MESSAGE);
      }
      const payload: unknown = await response.json();
      if (!isExplorerResponse(payload)) {
        throw new Error(MASTERS_UNAVAILABLE_MESSAGE);
      }
      // The route answers with an empty payload plus a notice when the
      // upstream is backing off and no local book covers the position.
      if (payload.notice && payload.games.length === 0) {
        throw new Error(MASTERS_UNAVAILABLE_MESSAGE);
      }
      const all = payload.games.slice(0, MASTERS_MAX_RESULTS).map((game) => mapMastersGame(game, payload.opening));
      const items = sortMastersItems(filterMastersItems(all, filters), filters.sort).slice(0, limit);
      return { items, nextCursor: null, total: items.length };
    },
    async loadPgn(gameId, signal) {
      const response = await doFetch(`/api/masters-pgn?id=${encodeURIComponent(gameId)}`, { signal });
      if (!response.ok) {
        throw new Error(
          response.status === 429 ? MASTERS_UNAVAILABLE_MESSAGE : `Masters game ${gameId} could not be loaded`,
        );
      }
      return response.text();
    },
  };
}

export const mastersSource: LibrarySourceAdapter = createMastersSource();
