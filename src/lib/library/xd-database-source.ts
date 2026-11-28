import { DEFAULT_POSITION } from "chess.js";
import { DEFAULT_SITE_LOCALE, isSiteLocale } from "../../i18n/locale.ts";
import { tPanels } from "../../i18n/studio-panel-strings.ts";
import { loadCatalog, type CatalogLine } from "../openings-catalog.ts";
import {
  fetchXdDatabase, loadXdGamePgn, XD_DATABASE_SOURCE, xdGameDate,
  type XdGameHeader, type XdGamePage,
} from "../xd-database/client.ts";
import { compareLibraryItems } from "./sort.ts";
import type { LibraryGameItem, LibrarySourceAdapter } from "./types.ts";

let openingRoots: Promise<ReadonlyMap<string, CatalogLine> | undefined> | undefined;

function loadOpeningRoots() {
  return (openingRoots ??= loadCatalog().then((entries) => {
    const roots = new Map<string, CatalogLine>();
    for (const entry of entries) {
      const current = roots.get(entry.eco);
      const order = current
        ? entry.uci.length - current.uci.length
          || entry.name.length - current.name.length
          || entry.name.localeCompare(current.name, "en")
        : -1;
      if (order < 0) roots.set(entry.eco, entry);
    }
    return roots;
  }).catch(() => {
    // Keep the game list usable if the catalog chunk fails to load.
    openingRoots = undefined;
    return undefined;
  }));
}

function gameEco(game: XdGameHeader): string | null {
  if (game.openingEco) return game.openingEco;
  const raw = game.eco?.trim().toUpperCase();
  if (!raw || raw === "?") return null;
  return raw.match(/^([A-E]\d{2})[A-Z]?\d?$/)?.[1] ?? raw;
}

function mapGame(game: XdGameHeader, roots: ReadonlyMap<string, CatalogLine> | undefined): LibraryGameItem {
  const eco = gameEco(game);
  return {
    key: `${XD_DATABASE_SOURCE}:${game.id}`,
    sourceId: XD_DATABASE_SOURCE,
    gameId: String(game.id),
    white: game.white,
    whiteElo: game.whiteElo,
    black: game.black,
    blackElo: game.blackElo,
    result: game.result,
    eco,
    opening: game.openingName || roots?.get(eco ?? "")?.name || null,
    plyCount: null,
    event: game.event,
    date: xdGameDate(game.date),
  };
}

export function createXdDatabaseSource(fetchImpl?: typeof fetch): LibrarySourceAdapter {
  return {
    id: XD_DATABASE_SOURCE,
    label(locale) {
      return tPanels(isSiteLocale(locale) ? locale : DEFAULT_SITE_LOCALE, "explorer.source.xadrez-digital");
    },
    capabilities: () => ({
      textSearch: "partial", opponent: "none", color: "none", result: "full", annotations: "none",
      position: "full", player: "full", eloRange: "full", eco: "none",
      date: "full", sort: "partial", maxResults: null,
    }),
    async list(filters, cursor, limit, signal) {
      const query = new URLSearchParams({ fen: filters.position?.fen ?? DEFAULT_POSITION });
      const player = filters.player.trim();
      // The explicit player filter takes precedence over the search box for this source.
      const playerQuery = player || filters.query.trim();
      if (playerQuery.length > 120) return { items: [], nextCursor: null, total: null };
      if (playerQuery) query.set("playerQuery", playerQuery);
      if (player && filters.playerColor !== "both") query.set("color", filters.playerColor);
      if (filters.result !== "all") query.set("result", filters.result === "draw" ? "1/2-1/2" : filters.result);
      for (const [name, value] of [
        ["minRating", filters.eloMin], ["maxRating", filters.eloMax],
        ["minYear", filters.yearFrom], ["maxYear", filters.yearTo],
      ] as const) {
        if (value !== null) query.set(name, String(value));
      }

      const [pageCursor = "0", consumed = "0"] = cursor?.split(":") ?? [];
      if (!playerQuery || pageCursor !== "0") query.set("cursor", pageCursor);
      const response = await fetchXdDatabase(`games?${query}`, signal, fetchImpl);
      const { games, nextCursor, playersCapped }: XdGamePage = await response.json();
      const roots = games.some((game) => !game.openingName && gameEco(game))
        ? await loadOpeningRoots()
        : undefined;
      const sorted = games.map((game) => mapGame(game, roots)).sort((a, b) => compareLibraryItems(filters.sort, a, b));
      const offset = Number(consumed);
      const items = sorted.slice(offset, offset + limit);
      const cursorAfter = (used: number) => offset + used < sorted.length
        ? `${pageCursor}:${offset + used}`
        : nextCursor === null ? null : String(nextCursor);
      return { items, nextCursor: cursorAfter(items.length), cursorAfter, total: null, playersCapped };
    },
    loadPgn: (gameId, signal) => loadXdGamePgn(gameId, signal, fetchImpl),
  };
}

export const xdDatabaseSource = createXdDatabaseSource();
