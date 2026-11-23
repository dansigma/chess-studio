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

type XdFilters = Partial<Pick<ExplorerFilters, "minRating" | "sinceYear" | "untilYear">>;

export async function fetchXdMoves(
  fen: string,
  signal: AbortSignal,
  fetchImpl?: typeof fetch,
  priority?: "low",
): Promise<ExplorerResponse> {
  const query = new URLSearchParams({ fen });
  const tree = await fetchXdDatabase(`tree?${query}`, signal, fetchImpl, priority);
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
  return result;
}

export async function fetchXdGames(
  fen: string,
  { minRating = 0, sinceYear, untilYear }: XdFilters,
  signal: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<ExplorerGameRow[]> {
  if (sinceYear != null && untilYear != null && sinceYear > untilYear) return [];

  const query = new URLSearchParams({ fen });
  const rows: ExplorerGameRow[] = [];
  if (minRating > 0) query.set("minRating", String(minRating));
  if (sinceYear != null) query.set("minYear", String(sinceYear));
  if (untilYear != null) query.set("maxYear", String(untilYear));
  // Filters apply to the games list only; the tree above stays unfiltered.
  const filtered = minRating > 0 || sinceYear != null || untilYear != null;
  const requestLimit = filtered ? FILTERED_PAGE_REQUEST_LIMIT : 1;

  for (let request = 0; request < requestLimit; request++) {
    const response = await fetchXdDatabase(`games?${query}`, signal, fetchImpl);
    const { games, nextCursor }: XdGamePage = await response.json();
    const remaining = GAME_PAGE_SIZE - rows.length;
    rows.push(...games.slice(0, remaining).map(explorerGame));
    if (nextCursor == null || rows.length === GAME_PAGE_SIZE) break;
    query.set("cursor", String(nextCursor));
  }
  return rows;
}

const CACHE_CAPACITY = 200;

type Pending<T> = {
  controller: AbortController;
  promise: Promise<T>;
  subscribers: number;
};

function sessionRequests<T>() {
  const cache = new Map<string, T>();
  const inFlight = new Map<string, Pending<T>>();

  function get(key: string) {
    const value = cache.get(key);
    if (value !== undefined) {
      cache.delete(key);
      cache.set(key, value);
    }
    return value;
  }

  function load(key: string, signal: AbortSignal, fetchValue: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason);
    const cached = get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    let pending = inFlight.get(key);
    if (!pending) {
      const controller = new AbortController();
      const promise = fetchValue(controller.signal).then((value) => {
        controller.signal.throwIfAborted();
        cache.set(key, value);
        if (cache.size > CACHE_CAPACITY) cache.delete(cache.keys().next().value!);
        return value;
      }).finally(() => {
        if (inFlight.get(key)?.controller === controller) inFlight.delete(key);
      });
      pending = { controller, promise, subscribers: 0 };
      inFlight.set(key, pending);
    }

    const request = pending;
    request.subscribers++;
    return new Promise((resolve, reject) => {
      function release() {
        signal.removeEventListener("abort", abort);
        request.subscribers--;
      }

      function abort() {
        release();
        reject(signal.reason);
        // Effects may release and subscribe in the same commit, including when
        // navigation promotes a prefetched move to the active position.
        queueMicrotask(() => {
          if (!request.subscribers && inFlight.get(key) === request) {
            inFlight.delete(key);
            request.controller.abort();
          }
        });
      }

      signal.addEventListener("abort", abort, { once: true });
      request.promise.then((value) => {
        if (signal.aborted) return;
        release();
        resolve(value);
      }, (error: unknown) => {
        if (signal.aborted) return;
        release();
        reject(error);
      });
    });
  }

  return { get, load };
}

export function createXdExplorer(fetchImpl?: typeof fetch) {
  const moves = sessionRequests<ExplorerResponse>();
  const games = sessionRequests<ExplorerGameRow[]>();

  return {
    load(fen: string, filters: XdFilters, includeGames: boolean, signal: AbortSignal) {
      const known = moves.get(fen);
      const tree = moves.load(fen, signal, (sharedSignal) => fetchXdMoves(fen, sharedSignal, fetchImpl));
      const gameKey = JSON.stringify([fen, filters.minRating ?? 0, filters.sinceYear ?? null, filters.untilYear ?? null]);
      return {
        moves: tree,
        games: includeGames && known?.total !== 0
          ? games.load(gameKey, signal, (sharedSignal) => fetchXdGames(fen, filters, sharedSignal, fetchImpl))
          : undefined,
      };
    },

    async prefetch(position: ExplorerResponse, signal: AbortSignal) {
      if (signal.aborted || !position.moves.length) return;
      const chess = new Chess(position.fen);
      const childFens = new Map(chess.moves({ verbose: true }).map((move) => [move.lan, move.after]));
      const topMoves = [...position.moves].sort((a, b) => b.games - a.games).slice(0, 3);
      await Promise.allSettled(topMoves.flatMap(({ uci }) => {
        const fen = childFens.get(uci);
        return fen ? [moves.load(fen, signal, (sharedSignal) => fetchXdMoves(fen, sharedSignal, fetchImpl, "low"))] : [];
      }));
    },
  };
}

export const xdExplorer = createXdExplorer();
