import { formatInteger } from "../../i18n/format.ts";
import type { SiteLocale } from "../../i18n/locale.ts";
import { tPanels } from "../../i18n/studio-panel-strings.ts";
import type { PlayerGame, PlayerGamesResponse, PlayerHit } from "../player-types.ts";
import { fetchXdDatabase, XD_DATABASE_SOURCE, xdGameDate } from "./client.ts";

export type XdPlayerSummary = {
  id: string;
  name: string;
  count?: number;
  firstYear?: number | null;
  lastYear?: number | null;
};

export type XdLinesGame = {
  id: number;
  white: string;
  black: string;
  whiteElo: number | null;
  blackElo: number | null;
  result: "1-0" | "0-1" | "1/2-1/2";
  date: string | null;
  event: string | null;
  eco: string | null;
  moves: string;
  color: "white" | "black";
  playerResult: "win" | "loss" | "draw";
};

export type XdLines = { total: number; games: XdLinesGame[] };

/** The most recent games the lines endpoint returns (see `LINES_GAMES` in the route's shared module). */
export const XD_LINES_GAMES = 200;

export function xdPlayerHit(player: XdPlayerSummary, locale: SiteLocale): PlayerHit {
  const parts = [tPanels(locale, "explorer.source.xadrez-digital")];
  if (player.count) {
    parts.push(tPanels(locale, player.count === 1 ? "players.count.one" : "players.count.other", {
      count: formatInteger(locale, player.count),
    }));
  }
  const { firstYear, lastYear } = player;
  if (firstYear && lastYear) parts.push(firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`);
  return {
    id: `${XD_DATABASE_SOURCE}:${player.id}`,
    source: XD_DATABASE_SOURCE,
    username: player.id,
    displayName: player.name,
    subtitle: parts.join(" · "),
  };
}

export function xdLinesGame(game: XdLinesGame): PlayerGame {
  const date = xdGameDate(game.date)?.split("-").map(Number) ?? [];
  const [year = null, month = null, day = null] = date;
  return {
    id: String(game.id),
    xdId: game.id,
    winner: game.result === "1-0" ? "white" : game.result === "0-1" ? "black" : "draw",
    whiteName: game.white,
    whiteRating: game.whiteElo,
    blackName: game.black,
    blackRating: game.blackElo,
    year,
    month,
    event: game.event,
    eco: game.eco,
    opening: null,
    moves: game.moves,
    color: game.color,
    playerResult: game.playerResult,
    playedAt: year ? Date.UTC(year, (month ?? 1) - 1, day ?? 1) : null,
  };
}

export async function loadXdPlayerGames(player: PlayerHit, fetchImpl?: typeof fetch): Promise<PlayerGamesResponse> {
  const response = await fetchXdDatabase(`players/${encodeURIComponent(player.username)}/lines`, undefined, fetchImpl);
  const { total, games }: XdLines = await response.json();
  return {
    player,
    games: games.map(xdLinesGame),
    truncated: total > games.length,
    total,
  };
}
