import { DEFAULT_POSITION } from "chess.js";
import { DEFAULT_SITE_LOCALE, isSiteLocale } from "../../i18n/locale.ts";
import { tPanels } from "../../i18n/studio-panel-strings.ts";
import {
  fetchXdDatabase, loadXdGamePgn, searchXdPlayers, XD_DATABASE_SOURCE, xdGameDate,
  type XdGameHeader, type XdGamePage,
} from "../xd-database/client.ts";
import { playerSearchKey } from "../xd-database/format.ts";
import { compareLibraryItems } from "./sort.ts";
import type { LibraryGameItem, LibrarySourceAdapter } from "./types.ts";

function mapGame(game: XdGameHeader): LibraryGameItem {
  return {
    key: `${XD_DATABASE_SOURCE}:${game.id}`,
    sourceId: XD_DATABASE_SOURCE,
    gameId: String(game.id),
    white: game.white,
    whiteElo: game.whiteElo,
    black: game.black,
    blackElo: game.blackElo,
    result: game.result,
    eco: game.eco,
    opening: null,
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
      textSearch: "none", color: "none", result: "full", annotations: "none",
      position: "full", player: "full", eloRange: "full", eco: "none",
      date: "full", sort: "partial", maxResults: null,
    }),
    async list(filters, cursor, limit, signal) {
      const query = new URLSearchParams({ fen: filters.position?.fen ?? DEFAULT_POSITION });
      const player = filters.player.trim();
      if (player) {
        const players = await searchXdPlayers(player, signal, fetchImpl);
        const match = players.find(({ name }) => playerSearchKey(name) === playerSearchKey(player))
          ?? (players.length === 1 ? players[0] : undefined);
        if (!match) return { items: [], nextCursor: null, total: null };
        query.set("player", match.id);
        if (filters.playerColor !== "both") query.set("color", filters.playerColor);
      }
      if (filters.result !== "all") query.set("result", filters.result === "draw" ? "1/2-1/2" : filters.result);
      for (const [name, value] of [
        ["minRating", filters.eloMin], ["maxRating", filters.eloMax],
        ["minYear", filters.yearFrom], ["maxYear", filters.yearTo],
      ] as const) {
        if (value !== null) query.set(name, String(value));
      }

      const [pageCursor = "0", consumed = "0"] = cursor?.split(":") ?? [];
      query.set("cursor", pageCursor);
      const response = await fetchXdDatabase(`games?${query}`, signal, fetchImpl);
      const { games, nextCursor }: XdGamePage = await response.json();
      const sorted = games.map(mapGame).sort((a, b) => compareLibraryItems(filters.sort, a, b));
      const offset = Number(consumed);
      const items = sorted.slice(offset, offset + limit);
      const cursorAfter = (used: number) => offset + used < sorted.length
        ? `${pageCursor}:${offset + used}`
        : nextCursor === null ? null : String(nextCursor);
      return { items, nextCursor: cursorAfter(items.length), cursorAfter, total: null };
    },
    loadPgn: (gameId, signal) => loadXdGamePgn(gameId, signal, fetchImpl),
  };
}

export const xdDatabaseSource = createXdDatabaseSource();
