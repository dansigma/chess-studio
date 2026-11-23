import { Chess } from "chess.js";
import type { ExplorerFilters } from "../explorer-filters.ts";
import type { ExplorerGameRow, ExplorerResponse } from "../explorer-types.ts";
import { fetchXdDatabase, XD_DATABASE_SOURCE, xdGameDate, type XdGameHeader, type XdTree, type XdGamePage } from "./client.ts";

const GAME_PAGE_SIZE = 20;
const FILTERED_PAGE_REQUEST_LIMIT = 4;

function explorerGame(game: XdGameHeader): ExplorerGameRow {
  const [year, month] = (xdGameDate(game.date) ?? "").split("-");
  return {
    id: String(game.id),
    winner: game.result === "1-0" ? "white" : game.result === "0-1" ? "black" : "draw",
    whiteName: game.white,
    whiteRating: game.whiteElo,
    blackName: game.black,
    blackRating: game.blackElo,
    year: year ? Number(year) : null,
    month: month ? Number(month) : null,
    event: game.event,
    eco: game.eco,
    opening: null,
  };
}

export async function fetchXdExplorer(
  fen: string,
  { includeGames = false, signal, fetchImpl, minRating = 0, sinceYear, untilYear }: {
    includeGames?: boolean;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
  } & Partial<Pick<ExplorerFilters, "minRating" | "sinceYear" | "untilYear">> = {},
): Promise<ExplorerResponse> {
  const query = new URLSearchParams({ fen });
  const tree = await fetchXdDatabase(`tree?${query}`, signal, fetchImpl);
  const { opening, total, moves }: XdTree = await tree.json();
  const result: ExplorerResponse = {
    fen, source: XD_DATABASE_SOURCE, opening, total,
    white: 0, draws: 0, black: 0, moves: [], games: [],
  };
  if (!total) return result;

  const sanByUci = new Map(new Chess(fen).moves({ verbose: true }).map((move) => [move.lan, move.san]));
  for (const move of moves) {
    const { uci, white, draws, black, averageRating } = move;
    result.white += white;
    result.draws += draws;
    result.black += black;
    result.moves.push({
      uci, san: sanByUci.get(uci) ?? uci, white, draws, black,
      games: white + draws + black, averageRating: averageRating || null,
    });
  }
  if (!includeGames || (sinceYear != null && untilYear != null && sinceYear > untilYear)) return result;

  if (minRating > 0) query.set("minRating", String(minRating));
  if (sinceYear != null) query.set("minYear", String(sinceYear));
  if (untilYear != null) query.set("maxYear", String(untilYear));
  const requestLimit = query.size > 1 ? FILTERED_PAGE_REQUEST_LIMIT : 1;

  for (let request = 0; request < requestLimit; request++) {
    const response = await fetchXdDatabase(`games?${query}`, signal, fetchImpl);
    const { games, nextCursor }: XdGamePage = await response.json();
    const remaining = GAME_PAGE_SIZE - result.games.length;
    result.games.push(...games.slice(0, remaining).map(explorerGame));
    if (nextCursor == null || result.games.length === GAME_PAGE_SIZE) break;
    query.set("cursor", String(nextCursor));
  }
  return result;
}
