// SIG-1314: every game of a tournament from ONE request (`fetchTourPgn`), for the "All rounds" search.
import { splitPgnGames } from "@/src/chess/pgn-games";
import { fetchTourPgn } from "@/src/lib/live/lichess-broadcast";
import { lastUrlSegment, parseGame } from "@/src/lib/live/parse-game";
import { enqueueLiveRequest } from "./live-store";
import { cachedTourGames, pendingTourGames, trackTourGames, type TourGameRow } from "./live-tour-cache";

export type { TourGameRow };

function header(pgn: string, name: string): string | undefined {
  return new RegExp(`^\\[${name}\\s+"([^"]*)"\\]`, "mu").exec(pgn)?.[1];
}

/**
 * Pure: the rows of a tournament PGN, with the round id of each game from its `[BroadcastURL]`
 * (`.../round-3/djmeJZUw` -> `djmeJZUw`). Games without one, or without a `[GameURL]`, are skipped.
 * Within a round the rows are in board order (`[Board]`, else the PGN's order).
 */
export function parseTourPgn(text: string): TourGameRow[] {
  const entries: { row: TourGameRow; board: number; index: number }[] = [];
  for (const chunk of splitPgnGames(text)) {
    const roundId = lastUrlSegment(header(chunk, "BroadcastURL"));
    const parsed = roundId ? parseGame(chunk, roundId) : null;
    if (!roundId || !parsed) {
      continue;
    }
    const board = Number(header(chunk, "Board"));
    entries.push({
      row: {
        id: parsed.id,
        roundId,
        white: { ...parsed.white, fed: null, clockMs: null },
        black: { ...parsed.black, fed: null, clockMs: null },
        result: parsed.result,
      },
      board: Number.isInteger(board) && board > 0 ? board : Number.POSITIVE_INFINITY,
      index: entries.length,
    });
  }
  const firstSeen = new Map<string, number>();
  entries.forEach((e) => firstSeen.has(e.row.roundId) || firstSeen.set(e.row.roundId, e.index));
  entries.sort(
    (a, b) =>
      firstSeen.get(a.row.roundId)! - firstSeen.get(b.row.roundId)! ||
      (a.board === b.board ? a.index - b.index : a.board < b.board ? -1 : 1),
  );
  return entries.map((e) => e.row);
}

/**
 * Games of the tournament, once per session: a cached tournament, or one already requested, never
 * costs another request. The request goes through the shared serial queue (429 pause included).
 */
export function loadTourGames(tourId: string): Promise<TourGameRow[]> {
  const cached = cachedTourGames(tourId);
  if (cached) {
    return Promise.resolve(cached);
  }
  return (
    pendingTourGames(tourId) ??
    trackTourGames(
      tourId,
      enqueueLiveRequest((signal) => fetchTourPgn(tourId, signal)).then((text) => {
        if (text === null) {
          throw new Error("Tournament request was aborted");
        }
        return parseTourPgn(text);
      }),
    )
  );
}
